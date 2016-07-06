'use strict';
var request = require("request"); // request是用来请求数据
var cheerio = require("cheerio"); // cherrio是用jquery的语法来解析html
var fs = require('fs');
var Url = require('url');
var Path = require('path');
var process = require('process');
var Iconv = require('iconv').Iconv;
var _ = require('lodash');
var loadAndSave = require('./loadAndSave.js');

var list = [];
var added = {};
var config = {
    autoName: 'index.html', // 自动增加扩展名
    saveTo: __dirname + '/test/', // 下载文件保存路径
    deep: 10,
    speed: 10,
    isGBK: false, // 是否是gbk编码
    beforePush: false, // 文件加入下载路径前调用
    beforeLoad: false, // 下载文件前调用
    onLoad: false, // 下载文件成功后调用
    onFail: false // 下载文件失败后调用
};

function getLinks(obj) {
    var filename = obj.saveTo, url = obj.link, deep = obj.deep || 1;
    if (obj.deep >= config.deep) {
        return;
    }
    if (filename.indexOf('.html') < 0) {
        return;
    }
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
            var pathname = pushLink(hrefs[i].attribs.href, obj);
            if (pathname) {
                hrefs[i].attribs.href = pathname;
                changed += 1;
            }
        }

        var imgs = $('[src]');
        for (var i = 0; i < imgs.length; i++) {
            if (imgs[i].attribs['data-original']) {
                pathname = pushLink(imgs[i].attribs['data-original'], obj);
                if (pathname) {
                    imgs[i].attribs['data-original'] = pathname;
                    changed += 1;
                }
            } else if (imgs[i].attribs['src']) {
                pathname = pushLink(imgs[i].attribs['src'], obj);
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
            fs.writeFileSync(obj.saveTo, $.html(), 'utf8');
            console.log('重新写入：', obj.saveTo);
        }
    } catch (e) {
        console.log('getLinksError:', e);
    }

}

function pushLink(link, old) {
    var url = old ? old.link : '';
    if (!link) {
        return;
    }
    if (link.indexOf('javascript:') == 0) {
        return;
    }
    if (link.indexOf('void') == 0) {
        return;
    }

    if (link.indexOf('http') < 0 && url && url.indexOf('http') == 0) {
        link = Url.resolve(url, link);
    }
    if (link.indexOf('?') > 0) {
        link = link.substr(0, link.indexOf('?'));
    }

    if (link.indexOf('#') > 0) {
        link = link.substr(0, link.indexOf('#'));
    }

    if (added[link]) {
        return added[link].pathname;
    }
    if (typeof config.beforePush === 'function' && config.beforePush(link, old) === false) {
        return;
    }
    console.log('添加链接：', link, '         ');


    var obj = Url.parse(link);
    obj.link = link;

    // 计算保存文件位置
    var ext = Path.extname(obj.pathname);
    if (!ext && config.autoName) {
        // 不存在扩展名则自动增加
        if (obj.pathname.charAt(obj.pathname.length - 1) != '/') {
            obj.pathname += '/';
        }
        obj.pathname += config.autoName;
        ext = Path.extname(config.autoName);
    }
    obj.ext = ext;
    obj.saveTo = (config.saveTo + obj.pathname).replace('//', '/');
    obj.deep = typeof old.deep == 'undefined' ? 0 : obj.deep + 1 || 1;

    if (obj.deep == config.deep && obj.ext == '.html') {
        return;
    }
    list.push(obj);
    added[link] = obj;
    return obj.pathname;
}


var LoadingNum = 0;

function onLoad(loadedFile) {
    if (!loadedFile.saveTo) {
        console.log('error:', loadedFile);
    }
    console.log('下载完毕：', loadedFile.saveTo, '           ');
    LoadingNum -= 1;
    if (loadedFile && loadedFile.loaded == true) {
        if (typeof config.afterLoad === 'function') {
            config.afterLoad(loadedFile);
        }
        getLinks(loadedFile);
    }
    LoadNext();
}

function LoadNext() {
    while (list.length > 0 && LoadingNum < config.speed) {
        var loadObj = list.pop();
        if (typeof config.beforeLoad == 'function' && config.beforeLoad(loadObj) === false) {
            continue;
        }
        LoadingNum += 1;
        loadAndSave(loadObj).then(onLoad, onLoad);
    }
    //console.log('num:',LoadingNum);
    if (list.length == 0 && LoadingNum == 0) {
        console.log('全部下载完毕！     ');
        if (typeof config.onFinish === 'function') {
            try {
                config.onFinish();
            } catch (e) {
                console.log(e);
            }
        }
    }
    if (list.length == 0 && LoadingNum == 0) {
        console.log('退出程序！     ');
        process.abort();
        return;
    }
    if (list.length == 0 && LoadingNum != 0) {
        console.log('waiting loading: ', LoadingNum);
    }
}

module.exports = {
    init: function (_config) {
        config = _.extend(config, _config);
        // console.log(config);
    },
    pushLink: function (url) {
        pushLink(url, 0);
    },
    load: function (url) {
        pushLink(url, 0);
        LoadNext();
    }
};