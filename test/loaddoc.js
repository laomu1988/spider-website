/**
 * 下载nodejs文档
 * */

var spider = require(__dirname + '/../index.js');

var config = {
    deep: 2,
    saveTo: __dirname + '/save/',
    saveReplace: '',
    beforePush: function (link) {
        if (link.indexOf("laomu1988.github.io") < 0) {
            return false;
        }
    }
};

spider.init(config);
spider.load('http://laomu1988.github.io/index.html');