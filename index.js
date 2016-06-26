'use strict';
var request = require("request"); // request是用来请求数据
var cheerio = require("cheerio"); // cherrio是用jquery的语法来解析html
var fs = require('fs');
var Url = require('url');
var Path = require('path');
var Iconv = require('iconv').Iconv;
var _ = require('lodash');
var loadAndSave = require('./loadAndSave.js');

var script = '';
var folder = __dirname + '/meizi/';

var config = {
    autoName: 'index.html', // 自动增加扩展名
    saveTo: __dirname + '/test/',
    deep: 10,
    speed: 10,
    isGBK: false, // 是否是gbk编码
    beforeLoad: false, // 下载文件前调用
    onLoad: false, // 下载文件成功后调用
    onFail: false, // 下载文件失败后调用
    host: undefined // 下载文件域名
};


var deep = 3;
var list = [];
var addedObj = {};
var loadedObj = {};


function getLinks(filename, url, deep) {
    console.log('分析文件：', filename);
    deep = deep || 0;
    if (deep > config.deep) {
        return;
    }
    if (filename.indexOf('.html') < 0) {
        return;
    }

    deep += 1;
    console.log('读取');
    try {
        if (config.isGBK) {
            var gbk_to_utf8 = new Iconv('GBK', 'UTF8');
            var buffer = gbk_to_utf8.convert(fs.readFileSync(filename));
            //console.log(buffer.toString());
            var body = buffer.toString();
        } else {
            var body = fs.readFileSync(filename, 'utf8');
        }
    } catch (e) {
        console.log(e);
    }

    try {
        var $ = cheerio.load(body);
        var hrefs = $('[href]');
        for (var i = 0; i < hrefs.length; i++) {
            pushLink(hrefs[i].attribs.href, deep, url);
        }

        var imgs = $('img[src]');
        for (var i = 0; i < imgs.length; i++) {
            pushLink(imgs[i].attribs['data-original'] || imgs[i].attribs['src'], deep, url);
        }
    } catch (e) {
        console.log('getLinksError:', e);
    }

}

function pushLink(link, deep, url) {
    if (!link) {
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

    if (addedObj[link] || loadedObj[link]) {
        return;
    } else {
        console.log('添加链接：', link, '         ');
        addedObj[link] = true;
        var obj = Url.parse(link);
        obj.link = link;

        // 计算保存文件位置
        var saveTo = config.saveTo + obj.pathname;
        var filename = obj.pathname.substr(obj.pathname.lastIndexOf('/'));
        var ext = filename.substr(filename.indexOf('.'));
        if (filename === ext) {
            // 不存在扩展名则自动增加
            if (obj.pathname.charAt(obj.pathname.length) != '/') {
                saveTo += '/';
            }
            saveTo += config.autoName;
            ext = config.autoName.substr(config.autoName.indexOf('.'));
        }
        obj.ext = ext;
        obj.saveTo = saveTo.replace('//', '/');
        list.push(obj);
    }
}


var LoadingNum = 0;

function onLoad(loadedFile) {
    if (!loadedFile.saveTo) {
        //console.log(loadedFile);
    }
    console.log('下载完毕：', loadedFile.saveTo);
    LoadingNum -= 1;
    if (loadedFile && loadedFile.loaded == true) {
        if (typeof config.afterLoad === 'function') {
            config.afterLoad(loadedFile);
        }
        getLinks(loadedFile.saveTo, loadedFile.link, loadedFile.deep || 1);
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
    if (list.length == 0 && LoadingNum == 0 && typeof config.onFinish === 'function') {
        config.onFinish();
    }
}

LoadNext();
module.exports = {
    config: function (_config) {
        config = _.extend(config, _config);
        console.log(config);
    },
    load: function (url) {
        //return;
        pushLink(url, 0);
        LoadNext();
    }
};