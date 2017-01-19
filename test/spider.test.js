var Spider = require('../lib/spider');

var index = 'http://laomu1988.github.io/index.html';

var spider = new Spider({url: index, saveTo: __dirname + '/save/'});
spider.clean();
spider.update(index);
spider.load();