var Spider = require('../lib/spider')

var index = 'http://laomu1988.github.io/test.jpg'

var spider = new Spider({url: index, saveTo: __dirname + '/save_test/'})

var events = ['push', 'load_before', 'loaded', 'load_fail', 'error']

events.forEach(function (e) {
    spider.on(e, function (file) {
        console.log('event:', e, file && file.link)
    })
})
spider.clean();
spider.pushLink('http://laomu1988.github.io/test.jpg');

spider.load()
console.log('list:', spider.db.list);
