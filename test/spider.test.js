var Spider = require('../lib/spider')

var index = 'http://laomu1988.github.io/index.html'

var spider = new Spider({
  url: index,
  saveTo: __dirname + '/save/',
  // autoLinks: false,
  autoRelative: true
})

var events = ['push', 'load_before', 'loaded', 'load_fail','error']

events.forEach(function (e) {
  spider.on(e, function (file) {
    console.log('event:', e, file && file.link)
  })
})

spider.load()
console.log('spider.loadList:',spider.loadList);
