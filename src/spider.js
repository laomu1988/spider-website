const Event = require('events');
const cheerio = require("cheerio"); // cherrio是用jquery的语法来解析html
const fs = require('fs');
const Url = require('url');
const Path = require('path');
const Iconv = require('iconv').Iconv;
const _ = require('lodash');
const low = require('lowdb');
const request = require('request');
const mkdir = require('mk-dir');

/**
 * 文件state: 等待下载0, 下载中1,下载成功2,下载失败3, 无需下载-1
 *
 * */

const config = {
    url: '',                // 启动地址
    host: '',               // 仅下载该域名下内容
    temp: 'spider.json',    // 缓存文件
    autoName: 'index.html', // 自动增加扩展名
    saveTo: './spider/',    // 下载文件保存路径
    saveReplace: '',        // 保存时仅保存该路径下内容
    deep: 10,
    speed: 10,
    reTryTime: 10,
    isGBK: false // 是否是gbk编码
};
const headers = {
    //"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.8,en;q=0.6,zh-TW;q=0.4",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36"
};


class Spider extends Event {
    constructor(_config) {
        super();
        if (typeof _config === 'string') _config = {url: _config};
        _config = _.extend(config, _config);
        var startUrl = _config.url;
        if (!_config.host) {
            _config.host = Url.parse(startUrl).host;
        }
        var db = low(_config.temp);
        db.defaults({config: {}, list: []});
        this.db = db;
        this.config = _config;
        this.loadingNum = 0;

        // 判断config是否更改, 假如更改则清空历史记录
        var old_config = db.get('config');
        if (JSON.stringify(old_config) != JSON.stringify(_config)) {
            // 配置更新后,清空下载列表
            db.set('config', config).value();
            db.set('list', []).value();
            db.write();
        }
        var list = db.get('list').value();
        if (!list || typeof list.length === 'undefined') db.set('list', []);
        if (this.config.url) {
            this.pushLink(this.config.url);
        }
        this.db.get('list').find({href: this.config.url}).assign({state: 0}).value();
    }


    /**
     * 根据文件内容,判断其引入的其他文件
     * */
    resolve(file) {
        console.log('resolve:', file.href);
        var filename = file.saveTo, href = file.href, deep = file.deep || 1;
        if (file.deep >= config.deep || (file.ext !== '.html' && file.ext !== '.htm')) return;
        try {
            if (config.isGBK) {
                var gbk_to_utf8 = new Iconv('GBK', 'UTF8');
                var buffer = gbk_to_utf8.convert(fs.readFileSync(filename));
                var body = buffer.toString();
            } else {
                var body = fs.readFileSync(filename, 'utf8');
            }
            // console.log(body);
            var $ = cheerio.load(body);
            var hrefs = $('[href]');
            var changed = 0, pathname;
            for (var i = 0; i < hrefs.length; i++) {
                var pathname = this.pushLink(hrefs[i].attribs.href, file);
                if (pathname) {
                    hrefs[i].attribs.href = pathname;
                    changed += 1;
                }
            }

            var imgs = $('[src]');
            for (var i = 0; i < imgs.length; i++) {
                if (imgs[i].attribs['data-original']) {
                    pathname = this.pushLink(imgs[i].attribs['data-original'], file);
                    if (pathname) {
                        imgs[i].attribs['data-original'] = pathname;
                        changed += 1;
                    }
                } else if (imgs[i].attribs['src']) {
                    pathname = this.pushLink(imgs[i].attribs['src'], file);
                    if (pathname) {
                        imgs[i].attribs['src'] = pathname;
                        changed += 1;
                    }
                }
            }
            if (changed > 0) {
                var html = $.html();
                if (config.isGBK) {
                    html = html.replace(/charset=\w+/, 'charset=utf-8')
                }
                fs.writeFileSync(file.saveTo, $.html(), 'utf8');
                console.log('重新写入：', file.saveTo);
            }
        } catch (e) {
            console.log('getLinksError:', e);
        }
    }

    pushLink(link, old) {
        console.log('pushLink:', link, old ? old.href : '');
        if (!link || link.indexOf('javascript:') === 0 || link.indexOf('void') === 0 || link[0] === '#' || link === '/') return;
        var from = old ? old.href : '';
        console.log('before call');
        if (link.indexOf('http') != 0 && from)link = Url.resolve(from, link);
        if (link.indexOf('?') > 0) link = link.substr(0, link.indexOf('?'));
        if (link.indexOf('#') > 0) link = link.substr(0, link.indexOf('#'));
        console.log('after cal', link);
        // 计算保存文件位置
        var ext = Path.extname(link);
        if (!ext && config.autoName) {
            link = Url.resolve(link + '/', config.autoName);
            ext = Path.extname(config.autoName);
        }
        var obj = Url.parse(link);
        if (obj.host !== this.config.host || (_.isArray(this.config.host) && this.config.host.indexOf(obj.host) < 0)) return;

        console.log('添加链接：', link, '         ');
        var found = this.db.get('list').find({href: link}).value();
        if (found && found.length > 0) return; // 已经添加,无需再次添加

        obj.ext = ext;

        if (!config.saveReplace) {
            obj.saveTo = (config.saveTo + obj.pathname).replace('//', '/');
        } else {
            console.log('pathname:', obj.pathname, config.saveReplace);
            var index = obj.pathname.indexOf(config.saveReplace);
            if (index == 0) {
                obj.pathname = obj.pathname.substr(config.saveReplace.length - 1);
                obj.saveTo = (config.saveTo + obj.pathname).replace('//', '/');
            } else {
                return;
            }
        }
        obj.deep = old && typeof old.deep == 'undefined' ? 0 : obj.deep + 1 || 1;

        if (obj.deep == config.deep && obj.ext == '.html') {
            return;
        }
        obj.state = 0;
        this.emit('push', obj);
        // 加入下载列表
        this.db.get('list').push(obj).value();
        this.loadNext();
        // console.log('origin:', obj);
        return old ? Path.relative(old.saveTo, obj.saveTo) : obj.pathname;
    }

    /**
     * 更新文件信息
     * */
    updateFileInfo(file) {
        if (!file || !file.href) return;
        this.db.get('list').find({href: file.href}).assign(file).value();
    }

    load() {
        if (this.loadingNum > this.config.speed) return;
        this.state = 'load';
        var list = this.db.get('list').filter({state: 0}).sortBy('reTryTime').value();
        var db = this.db;
        var that = this;

        if (list.length > 0) {
            var file = list[0];
            db.find({href: file.href}).assign({state: 1}).value();
            that.loadingNum += 1;
            console.log('开始下载:', file.href);
            this.loadAndSave(file.href, file.saveTo).then(function (response) {
                console.log('下载成功:', file.href);
                that.loadingNum -= 1;
                file.state = 2;
                file.length = parseInt(response.headers['content-length']) || 0;
                that.updateFileInfo(file);
                setTimeout(function () {
                    // 避免文件还未存储下来
                    that.resolve(file);
                    that.loadNext();
                }, 1000);
            }, function (err) {
                console.log('下载失败:', file.href, err);
                that.loadingNum -= 1;
                if (file.reTryTime > that.config.reTryTime) {
                    file.state = 3;
                } else {
                    file.state = 0;
                    file.reTryTime = (file.reTryTime + 1) || 1;
                }
                that.updateFileInfo(file);
                that.loadNext();
            });
        } else {
            console.log("下载完毕.");
        }
    }

    loadNext() {
        var that = this;
        setTimeout(function () {
            if (that.state === 'load') that.load();
        }, 1000);
    }

    stop() {
        this.state = 'stop';
    }

    /**
     * 下载链接并保存
     * */
    loadAndSave(href, saveTo) {
        console.log("loadAndSave:", href, saveTo);
        return new Promise(function (resolve, reject) {
            try {
                mkdir(saveTo.substr(0, saveTo.lastIndexOf('/')));
            } catch (e) {
                console.warning(e);
            }
            request.get({url: encodeURI(href), gzip: false, headers: headers, encoding: null})
                .on('response', function (response) {
                    resolve(response);
                })
                .on('error', function (err) {
                    console.log('erro:', err);
                    reject(err);
                })
                .on('end', function () {
                    setTimeout(function () {
                        resolve(-1);
                    }, 20);
                })
                .pipe(fs.createWriteStream(saveTo))
        });
    }

    update(link) {
        if (!link) link = this.config.url;
        if (!link) return this;
        var file = this.db.get('list').find({href: link}).value();
        if (file && file.length > 0) {
            this.db.get('list').find({href: link}).assign({state: 0}).value();
            this.loadNext();
        } else {
            this.pushLink(link);
        }
    }

    // 清空下载记录
    clean() {
        this.db.set('list', []).value();
        return this;
    }
}

module.exports = Spider;