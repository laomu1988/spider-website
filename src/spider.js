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

const config = {
    url: '',               // 启动地址
    temp: 'spider.json',   // 缓存文件
    autoName: 'index.html', // 自动增加扩展名
    saveTo: './spider/',    // 下载文件保存路径
    saveReplace: '',      // 保存时仅保存该路径下内容
    deep: 10,
    speed: 10,
    reTryTime: 10,
    isGBK: false, // 是否是gbk编码
    beforePush: false, // 文件加入下载路径前调用
    beforeLoad: false, // 下载文件前调用
    onLoad: false, // 下载文件成功后调用
    onFail: false // 下载文件失败后调用
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
//
// class File {
//     constructor(url, from, config) {
//         if (!url) {
//             return false;
//         }
//         this.url = url;
//         var obj = Url.parse(url);
//         // 计算保存文件位置
//         var ext = Path.extname(obj.pathname);
//         if (!ext && config.autoName) {
//             obj.pathname = Path.resolve(obj.pathname + '/' + config.autoName);
//             ext = Path.extname(config.autoName);
//         }
//         this.ext = ext;
//
//         if (!config.saveReplace) {
//             obj.saveTo = (config.saveTo + obj.pathname).replace('//', '/');
//         } else {
//             console.log('pathname:', obj.pathname, config.saveReplace);
//             var index = obj.pathname.indexOf(config.saveReplace);
//             if (index == 0) {
//                 obj.pathname = obj.pathname.substr(config.saveReplace.length - 1);
//                 obj.saveTo = (config.saveTo + obj.pathname).replace('//', '/');
//             } else {
//                 return;
//             }
//         }
//         this.deep = from && typeof from.deep == 'undefined' ? 0 : obj.deep + 1 || 1;
//
//         if (this.deep == config.deep && obj.ext == '.html') {
//             return;
//         }
//
//     }
//
//     load() {
//         var that = this;
//         return new Promise(function (resolve, reject) {
//             try {
//                 mkdir(saveTo.substr(0, saveTo.lastIndexOf('/')));
//             } catch (e) {
//                 console.warning(e);
//             }
//             request.get({url: encodeURI(url), gzip: false, headers: headers, encoding: null})
//                 .on('response', function (response) {
//                     if (response.statusCode == 200) {
//                         resolve(response);
//                     } else {
//                         reject(response);
//                     }
//                 })
//                 .on('error', function (err) {
//                     reject(err);
//                 })
//                 .on('end', function () {
//                     setTimeout(function () {
//                         resolve(-1);
//                     }, 20);
//                 })
//                 .pipe(fs.createWriteStream(loadObj.saveTo))
//         });
//     }
// }

/**
 * 文件state: 等待下载0, 下载中1,下载成功2,下载失败3, 无需下载-1
 *
 * */


class Spider extends Event {
    constructor(_config) {
        super();
        if (typeof _config === 'string') _config = {url: _config};
        _config = _.extend(config, _config);
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
        if (this.config.url) {
            this.pushLink(this.config.url);
        }
    }

    getLinks(file) {
        var filename = file.saveTo, href = file.link, deep = file.deep || 1;
        var ext = Path.extname(filename);
        if (file.deep >= config.deep || (ext !== '.html' && ext !== '.htm')) return;
        try {
            if (config.isGBK) {
                var gbk_to_utf8 = new Iconv('GBK', 'UTF8');
                var buffer = gbk_to_utf8.convert(fs.readFileSync(filename));
                var body = buffer.toString();
            } else {
                var body = fs.readFileSync(filename, 'utf8');
            }
            var $ = cheerio.load(body);
            var hrefs = $('[href]');
            var changed = 0, pathname;
            for (var i = 0; i < hrefs.length; i++) {
                var pathname = this.pushLink(hrefs[i].attribs.href, obj);
                if (pathname) {
                    hrefs[i].attribs.href = pathname;
                    changed += 1;
                }
            }

            var imgs = $('[src]');
            for (var i = 0; i < imgs.length; i++) {
                if (imgs[i].attribs['data-original']) {
                    pathname = this.pushLink(imgs[i].attribs['data-original'], obj);
                    if (pathname) {
                        imgs[i].attribs['data-original'] = pathname;
                        changed += 1;
                    }
                } else if (imgs[i].attribs['src']) {
                    pathname = this.pushLink(imgs[i].attribs['src'], obj);
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
        if (!link || link.indexOf('javascript:') == 0 || link.indexOf('void') == 0) return;
        var from = old ? old.link : '';

        if (link.indexOf('http') < 0 && from && from.indexOf('http') == 0)link = Url.resolve(from, link);
        if (link.indexOf('?') > 0) link = link.substr(0, link.indexOf('?'));
        if (link.indexOf('#') > 0) link = link.substr(0, link.indexOf('#'));

        var found = this.db.get('list').find({href: link}).value();
        if (found && found.length > 0) return; // 已经添加,无需再次添加

        if (typeof config.beforePush === 'function' && config.beforePush(link, old) === false) {
            return;
        }
        console.log('添加链接：', link, '         ');
        var obj = Url.parse(link);
        console.log('origin:', obj);
        // 计算保存文件位置
        var ext = Path.extname(obj.pathname);
        if (!ext && config.autoName) {
            obj.pathname = Path.resolve(obj.pathname + '/' + config.autoName);
            ext = Path.extname(config.autoName);
        }
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
        // 加入下载列表
        this.db.get('list').push(obj).value();
        return obj.pathname;
    }

    load() {
        if (this.loadingNum > this.config.speed) return;
        this.state = 'load';
        var list = this.db.get('list').filter({state: 0}).sortBy('reTryTime').value();
        var db = this.db;
        var that = this;

        function next() {
            setTimeout(function () {
                if (that.state === 'load') that.load();
            }, 1000);
        }

        if (list.length > 0) {
            var file = list[0];
            db.find({href: file.href}).assign({state: 1}).value();
            that.loadingNum += 1;
            console.log('开始下载:', file);
            this.loadAndSave(file.href, file.saveTo).then(function (response) {
                console.log('下载成功:', file.href);
                that.loadingNum -= 1;
                db.get('list').find({href: file.href}).assign({
                    state: 2,
                    length: response.headers['content-length']
                }).value();
                next();
            }, function (err) {
                console.log('下载失败:', file.href);
                that.loadingNum -= 1;
                if (file.reTryTime > that.config.reTryTime) {
                    db.get('list').find({href: file.href}).assign({state: 3});
                } else {
                    db.get('list').find({href: file.href}).assign({state: 0, reTryTime: (file.reTryTime + 1) || 1});
                }
                next();
            });
        }
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
                    console.log('response:', response);
                    if (response.statusCode == 200) {
                        resolve(response);
                    } else {
                        reject(response);
                    }
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
}

module.exports = Spider;