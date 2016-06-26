var request = require('request');
var mkdir = require('mk-dir');
var Url = require('url');
var fs = require('fs');
/*
 var config = {
 saveTo: ''
 };*/

var headers = {
    //"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.8,en;q=0.6,zh-TW;q=0.4",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36"
};

function loadAndSave(loadObj) {
    return new Promise(function (resolve, reject) {
        try {
            var saveTo = loadObj.saveTo;
            var url = loadObj.link;
            setTimeout(function () {
                reject(loadObj);
            }, 300000);
            // 已经存在文件
            if (fs.existsSync(loadObj.saveTo)) {
                console.log('已经存在文件:', saveTo, '                           ');
                loadObj.loaded = true;
                resolve(loadObj);
                return;
            }
            // 创建路径
            mkdir(saveTo.substr(0, saveTo.lastIndexOf('/')));
            console.log('load:', loadObj.link, 'saveTo:', loadObj.saveTo);
        } catch (e) {
            console.log(e);
        }

        request.get({url: encodeURI(url), gzip: false, headers: headers})
            .on('response', function (response) {
                if (response.statusCode == 200) {
                    console.log('loadimg success');
                    loadObj.loaded = true;
                } else {
                    console.log('loadimgfailure:', response.statusCode);
                    setTimeout(function () {
                        fs.unlinkSync(saveTo);
                    }, 5000);
                    loadObj.failure = true;
                    reject(loadObj);
                }
            })
            .on('error', function (err) {
                console.log('loadimgerr:', err);
                loadObj.failure = true;
                reject(loadObj);
            })
            .on('end', function () {
                console.log('loadimg end');
                setTimeout(function () {
                    resolve(loadObj);
                }, 20);
            })
            .pipe(fs.createWriteStream(loadObj.saveTo))
    });
}

module.exports = loadAndSave;