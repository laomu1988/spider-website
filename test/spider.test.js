var Spider = require('../lib/spider')

var index = 'http://laomu1988.github.io/index.html'

var spider = new Spider({url: index, saveTo: __dirname + '/save/'})

var events = ['push', 'load_before', 'loaded', 'load_fail','error']

events.forEach(function (e) {
  spider.on(e, function (file) {
    console.log('event:', e, file && file.link)
  })
})

spider.clean()
console.log('push:', spider.push(index));

console.log('spider.list:',spider.list);
spider.load()
console.log('spider.loadList:',spider.loadList);
