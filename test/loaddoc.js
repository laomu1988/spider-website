/**
 * 下载nodejs文档
 * */

var spider = require(__dirname + '/../index.js');
var fs = require('fs');

var exts = {
    '.html': true,
    '.js': true,
    '.jpg': true,
    '.gif': true,
    '.css': true
};

var otherLink = [];
var config = {
    deep: 1,
    saveTo: __dirname + '/node4/',
    beforeLoad: function (loadObj) {
        //console.log(loadObj);
        console.log('beforeLoad:', loadObj.link, loadObj.ext);
        if (loadObj.ext && !exts[loadObj.ext]) {
            // 取消下载其他扩展名的文件
            console.log('ignore:', loadObj.link, loadObj.ext);
            return false;
        }
        if (loadObj.host.indexOf('nodejs') < 0) {
            otherLink.push(loadObj.link);
            return false;
        }
    },
    onFinish: function () {
        console.log('otherLink:', otherLink);
        fs.writeFileSync(_dirname + '/otherLink.json', JSON.stringify(otherLink));
    }
};

spider.config(config);
spider.load('https://nodejs.org/dist/latest-v4.x/docs/api/index.html');