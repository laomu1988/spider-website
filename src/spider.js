const Event = require('events');
const cheerio = require("cheerio"); // cherrio是用jquery的语法来解析html
const fs = require('fs');
const Url = require('url');
const Path = require('path');
const Iconv = require('iconv').Iconv;
const _ = require('lodash');
const temp = require('temp-data');
const request = require('request');
const mkdir = require('mk-dir');
const debug = require('debug')('spider');
const isDir = require('is-dir');

/**
 * 文件state: 等待下载0, 下载中1,下载成功2,下载失败3, 无需下载-1
 *
 * */

const config = {
    url: '', // 启动地址
    host: '', // 仅下载该域名下内容
    temp: 'spider.json', // 缓存文件
    autoName: 'index.html', // 自动增加扩展名
    saveTo: './spider/', // 下载文件保存路径
    saveReplace: '', // 保存时仅保存该路径下内容
    deep: 10, // 最多加载深度
    speed: 10, // 同时下载多少个文件
    reTryTime: 10, // 最多重试次数
    isGBK: false, // 是否是gbk编码
    timeout: 100000 // 下载超时时间
};


class Spider extends Event {
    constructor(_config) {
        super();
        if (typeof _config === 'string') _config = {
            url: _config
        };
        _config = _.extend(config, _config);
        var startUrl = _config.url;
        if (!_config.host) {
            _config.host = Url.parse(startUrl).host;
        }
        mkdir(config.saveTo + '/');
        var db = temp(Path.resolve(config.saveTo + '/', _config.temp), {
            config: {},
            links: {}, // 链接列表
            list: [] // 链接列表
        });
        this.db = db;
        this.config = _config;
        this.loadingNum = 0; // 正在下载的文件数
        this.loadState = ''; // 文件下载状态： 默认空， load： 下载中，stop： 停止下载

        // 判断config是否更改, 假如更改则清空历史记录
        var old_config = db.config;
        if (JSON.stringify(old_config) !== JSON.stringify(_config)) {
            db.config = config;
            this.clean();
        }
        if (!db.list) db.list = [];
        if (this.config.url) {
            this.pushLink(this.config.url);
        }
        debug('start spider..');
        this.save();
    }
    save() {
        this.db.$save();
    }

    /**
     * 下载完毕后，根据文件内容,判断其引入的其他文件
     * */
    getLinks(file) {
        debug('getLinks:', file.link);
        var filename = config.saveTo + '/' + file.saveTo;
        if (file.deep > config.deep || (file.ext !== '.html' && file.ext !== '.htm')) return;
        try {
            if (config.isGBK) {
                var gbk_to_utf8 = new Iconv('GBK', 'UTF8');
                var buffer = gbk_to_utf8.convert(fs.readFileSync(filename));
                var body = buffer.toString();
            } else {
                var body = fs.readFileSync(filename, 'utf8');
            }
            // debug(body);
            var $ = cheerio.load(body);
            var hrefs = $('[href]');
            var changed = 0,
                pathname;
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
                fs.writeFileSync(filename, $.html(), 'utf8');
                debug('重新写入：', filename);
            }
        } catch (e) {
            console.trace('getLinksError:', e);
        }
    }

    /**
     * 添加新连接
     * @param link: 链接链接地址
     * @param from:  引用该文件的文件
     * */
    pushLink(link, old) {
        // if (link === '/') {
        //     var relative = (old && Path.relative(Path.dirname(old.saveTo), this.config.saveTo + '/')) || './';
        //     debug('relativeIndex:', relative, old.saveTo, this.config.saveTo);
        //     return relative;
        // }
        var file = this.absolute(link, old && old.link);
        if (!file) return;
        // 判断是否已经加入列表中
        var link = file.link;
        debug('pushLink:', file.link);
        if (this.db.links[link]) {
            debug('link has been added ..');
            return;
        }
        // 根据host判断是否在可下载列表中
        if (file.host !== this.config.host || (_.isArray(this.config.host) && this.config.host.indexOf(file.host) < 0)) {
            debug('link host is NOT in config.host ..');
            return;
        }
        file.saveTo = this.getSavePath(file);
        file.deep = old && old.deep ? file.deep + 1 || 1 : 0;
        if (file.deep > config.deep && file.ext == '.html') {
            debug('link is deep');
            return;
        }

        console.log('添加链接：', link, '         ');
        file.state = 0;
        // 加入下载列表
        this.db.links[link] = file;
        this.db.list.push(link);
        this.save();
        this.emit('push', file);
        this.loadNext();
        return old ? Path.relative(Path.dirname(old.saveTo), file.saveTo) : file.pathname;
    }

    getSavePath(file) {
        var index = config.saveReplace && file.pathname.indexOf(config.saveReplace);
        if (index === 0) {
            return file.pathname.substr(config.saveReplace.length - 1);
        } else {
            return file.pathname;
        }
    }

    absolute(link, from) {
        debug('absolute:', link, from);
        // if (link === '/') {
        //     var relative = (old && Path.relative(Path.dirname(old.saveTo), this.config.saveTo + '/')) || './';
        //     debug('relativeIndex:', relative, old.saveTo, this.config.saveTo);
        //     return relative;
        // }
        if (!link || link.indexOf('javascript:') === 0 || link.indexOf('void') === 0 || link.indexOf('data:image') === 0 || link[0] === '#') return;
        if (link.indexOf('http') != 0 && from) link = Url.resolve(from, link);
        if (link.indexOf('?') > 0) link = link.substr(0, link.indexOf('?'));
        if (link.indexOf('#') > 0) link = link.substr(0, link.indexOf('#'));

        // 计算保存文件位置,加入是文件夹则自动增加文件路径
        var file = Url.parse(link);
        var ext = Path.extname(file.pathname);
        if (!ext && config.autoName) {
            file.pathname = (file.pathname + '/' + config.autoName).replace(/\/\//g, '/');
            ext = Path.extname(config.autoName);
        }
        return {
            host: file.host,
            link: file.protocol + '//' + file.host + file.pathname,
            pathname: file.pathname,
            query: file.query,
            ext: ext
        };
    }
    getNeedLoad() {
        if (!this._needLoaded || this._needLoaded.length === 0) {
            var links = this.db.links;
            var list = this.db.list.map(function(link) {
                return links[link];
            });
            // debug(list, list.filter);
            this._needLoaded = this.db.list.map(function(link) {
                return links[link];
            }).filter(function(a) {
                return a.state == 0;
            });
        }
        if (this._needLoaded && this._needLoaded.length > 0) {
            return this._needLoaded.pop();
        }
        return false;
    }

    load() {
        if (this.loadingNum > this.config.speed) return;
        var file = this.getNeedLoad();
        if (!file) return;
        var that = this;
        this.state = 'load';
        file.state = 1;
        that.loadingNum += 1;
        console.log('开始下载:', file.link, file.saveTo);
        loadAndSave(file.link, this.config.saveTo + '/' + file.saveTo, this.config.tiemout).then(function(response) {
            console.log('下载成功:', file.link);
            that.loadingNum -= 1;
            file.state = 2;
            setTimeout(function() {
                // 避免文件还未存储下来
                that.getLinks(file);
                that.loadNext();
                that.save();
            }, 1000);
        }, function(err) {
            console.warning('下载失败:', file.link, err);
            that.loadingNum -= 1;
            if (file.reTryTime > that.config.reTryTime) {
                file.state = 3;
            } else {
                file.state = 0;
                file.reTryTime = (file.reTryTime + 1) || 1;
            }
            that.loadNext();
            that.save();
        });
    }

    /**
     * 继续下载下一个文件
     */
    loadNext() {
        var that = this;
        setTimeout(function() {
            if (that.state === 'load') that.load();
        }, 1000);
    }

    /**
     * 停止下载文件
     */
    stop() {
        this.state = 'stop';
    }

    /**
     * 更新文件状态
     * - 首页配置为未下载
     * - todo: 判断带有hash的文件是否需要下载,例如 a.js?abc=12
     * */
    update(link) {
        if (!link) link = this.config.url;
        if (!link) return this;
        var file = this.absolute(link);
        if (!file) return this;
        file = this.db.links[file.link];
        if (file) {
            file.state = 0;
            file.loadTimes = 0;
            this.save();
        } else {
            this.pushLink(link);
        }
        this.load();
    }

    // 清空下载记录
    clean() {
        var db = this.db;
        this.db.list = [];
        this.db.links = {};
        this.save();
        return this;
    }
}

const headers = {
    //"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.8,en;q=0.6,zh-TW;q=0.4",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36"
};

function loadAndSave(href, saveTo, timeout) {
    // debug('loadAndSave:', href, saveTo);
    return new Promise(function(resolve, reject) {
        if (saveTo.indexOf('?') >= 0) saveTo = saveTo.substr(0, saveTo.indexOf('?'));
        if (isDir(saveTo)) return reject(new Error('saveTo path is directory...'));
        try {
            mkdir(saveTo.substr(0, saveTo.lastIndexOf('/')));
        } catch (e) {
            console.warning(e);
        }
        setTimeout(reject, timeout || 100000)

        request.get({
                url: encodeURI(href),
                gzip: false,
                headers: headers,
                encoding: null
            })
            .on('response', resolve)
            .on('error', reject)
            .pipe(fs.createWriteStream(saveTo))
    });
}

module.exports = Spider;
