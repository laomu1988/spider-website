const Event = require('events')
const cheerio = require('cheerio') // cherrio是用jquery的语法来解析html
const fs = require('fs')
const Url = require('url')
const Path = require('path')
const Iconv = require('iconv').Iconv
const _ = require('lodash')
const temp = require('temp-data')
const request = require('request')
const mkdir = require('mk-dir')
const debug = require('debug')('spider')
const isDir = require('is-dir')
const death = require('death')
const hash = require('object-hash')

/**
 * 文件state: 等待下载0, 下载中1,下载成功2,下载失败3, 无需下载-1
 *
 * */

const config = {
  url: '',                // 启动地址
  host: '',               // 仅下载该域名下内容,默认和url中host一致
  temp: 'spider.json',    // 缓存文件,存放下载列表
  autoName: 'index.html', // 自动增加扩展名
  saveTo: './spider/',    // 下载文件保存路径
  saveReplace: '',        // 保存时仅保存该路径下内容
    // autoResolve: true,   // 是否自动根据html引入文件
  deep: 10,               // 最多加载深度
  speed: 10,              // 同时下载多少个文件
  reTryTime: 10,          // 最多重试次数
  isGBK: false,           // 是否是gbk编码
  listSaveTime: 600 * 1000, // 列表保存间隔时间
  timeout: 100000         // 下载超时时间
}

class Spider extends Event {
  constructor (_config) {
    super()
    if (typeof _config === 'string') {
      _config = {
        url: _config
      }
    }
    _config = _.extend(config, _config)
    var startUrl = _config.url

    if (!_config.host) {
      _config.host = Url.parse(startUrl).host
    }

    mkdir(config.saveTo + '/')
    var db = temp(Path.resolve(config.saveTo + '/', _config.temp), {
      config: {},
      links: {}, // 链接列表
      list: [] // 链接列表
    }, {
      timeout: _config.listSaveTime
    })
    this.db = db
    this.config = _config
    this.loadState = '' // 文件下载状态： 默认空， load： 下载中，stop： 停止下载
    this.loadList = []  // 正在下载的文件列表
    this.loadCount = 0

        // 判断config是否更改, 假如更改则清空历史记录
    var old_config = db.config
    if (JSON.stringify(old_config) !== JSON.stringify(_config)) {
      db.config = config
      this.clean()
    }
    if (!db.list) db.list = []
    if (this.config.url) {
      this.pushLink(this.config.url)
    }
    debug('start spider..')
    this.save()
    death(() => {
      debug('death')
      this.save(true)
            // process.exit();
      process.nextTick(function () {
        process.exit()
      })
    })
  }

    /**
     * 保存下载记录
     * */
  save (isRightNow) {
    this.db.$save(isRightNow)
  }

    /**
     * 下载完毕后，根据文件内容,判断其引入的其他文件
     * */
  getLinks (file, body) {
    var filename = config.saveTo + '/' + file.saveTo
    if (file.deep > config.deep || (file.ext !== '.html' && file.ext !== '.htm')) return
    debug('getLinks:', file.link, body)
    try {
      if (config.isGBK) {
        var gbk_to_utf8 = new Iconv('GBK', 'UTF8')
        var buffer = gbk_to_utf8.convert(body)
        body = buffer.toString()
      } else {
        body = body + ''
      }

      var me = this
      var $ = cheerio.load(body)
      var attrs = ['href', 'src', 'data-original']
      var list = Array.prototype.slice.call($('[href],[src]'))
            // debug('list', list);
      var changed = 0
      list.forEach(function (dom) {
        var attr = '',
          domAttrs = dom.attribs
        for (var i = 0; i < attrs.length; i++) {
          if (domAttrs[attrs[i]]) {
            attr = attrs[i]
            break
          }
        }
        if (!attr) return debug('no attr')
        var link = me.relative(domAttrs[attr], file)
        if (dom.attribs[attr] !== link) {
          dom.attribs[attr] = link
          changed += 1
        }
      })
      if (changed > 0) {
        var html = $.html()
        if (config.isGBK) {
          html = html.replace(/charset=\w+/, 'charset=utf-8')
        }
        fs.writeFileSync(filename, html, 'utf8')
        debug('重新写入：', filename)
      }
    } catch (e) {
      console.trace('getLinksError:', e)
    }
  }

    /**
     * 计算相对路径地址
     */
  relative (link, old) {
    var file = this.pushLink(link, old)
    if (file) {
      return relative(old.saveTo, file.saveTo)
    } else if (link.indexOf('//') === 0) {
      return (old && old.protocol || 'http:') + link
    } else {
      return link
    }
  }

    /**
     * 添加新连接
     * @param link: 链接链接地址
     * @param from:  引用该文件的文件
     *
     * @return file: 文件对象
     * */
  pushLink (link, old) {
        // if (link === '/') {
        //     var relative = (old && Path.relative(Path.dirname(old.saveTo), this.config.saveTo + '/')) || './';
        //     debug('relativeIndex:', relative, old.saveTo, this.config.saveTo);
        //     return relative;
        // }
    var file = this.absolute(link, old && old.link)
    if (!file) return
        // 判断是否已经加入列表中
    link = file.link
    debug('pushLink:', file.link)
    if (this.db.links[link]) {
      debug('link has been added ..')
      return this.db.links[link]
    }
        // 根据host判断是否在可下载列表中
    if (file.host !== this.config.host || (_.isArray(this.config.host) && this.config.host.indexOf(file.host) < 0)) {
      debug('link host is NOT in config.host ..')
      return
    }
    file.saveTo = this.getSavePath(file)
    file.deep = old && old.deep ? file.deep + 1 || 1 : 0
    if (file.deep > config.deep && file.ext == '.html') {
      debug('link is deep')
      return
    }
    debug('添加链接:', link)
    file.state = 0
        // 加入下载列表
    this.db.links[link] = file
    this.db.list.push(link)
    this.save()
    this.emit('push', file)
    this.loadNext()
    return file
  }

  getSavePath (file) {
    var index = config.saveReplace && file.pathname.indexOf(config.saveReplace)
    if (index === 0) {
      return file.pathname.substr(config.saveReplace.length - 1)
    } else {
      return file.pathname
    }
  }

  absolute (link, from) {
    debug('absolute:', link, from)
        // if (link === '/') {
        //     var relative = (old && Path.relative(Path.dirname(old.saveTo), this.config.saveTo + '/')) || './';
        //     debug('relativeIndex:', relative, old.saveTo, this.config.saveTo);
        //     return relative;
        // }
    if (!link || link.indexOf('javascript:') === 0 || link.indexOf('void') === 0 || link.indexOf('data:image') === 0 || link[0] === '#') return
    if (link.indexOf('http') != 0 && from) link = Url.resolve(from, link)
    if (link.indexOf('?') > 0) link = link.substr(0, link.indexOf('?'))
    if (link.indexOf('#') > 0) link = link.substr(0, link.indexOf('#'))

        // 计算保存文件位置,加入是文件夹则自动增加文件路径
    var file = Url.parse(link)
    var ext = Path.extname(file.pathname)
    if (!ext && config.autoName) {
      file.pathname = (file.pathname + '/' + config.autoName).replace(/\/\//g, '/')
      ext = Path.extname(config.autoName)
    }
    return {
      host: file.host,
      protocol: file.protocol,
      link: file.protocol + '//' + file.host + file.pathname,
      pathname: file.pathname,
      query: file.query,
      ext: ext
    }
  }

  getNeedLoad () {
    if (!this._needLoaded || this._needLoaded.length === 0) {
      var links = this.db.links
      this._needLoaded = this.db.list.map(function (link) {
        return links[link]
      }).filter(function (a) {
        return a.state == 0
      })
    }
    if (this._needLoaded && this._needLoaded.length > 0) {
      return this._needLoaded.pop()
    }
    return false
  }

  load (file) {
    var that = this
    if (file) {
      if (typeof file === 'string') {
        file = that.pushLink(file)
      }
    } else {
      this.state = 'load'
      if (this.loadList.length >= this.config.speed) return that
      file = that.getNeedLoad()
    }
    if (!file) return this

    file.state = 1
    this.loadCount += 1
    that.loadList.push(file)
    that.emit('load_before', file)
    loadAndSave(file.link, this.config.saveTo + '/' + file.saveTo, this.config.tiemout).then(loadSuccess, loadFail).catch(loadFail)
    function loadSuccess (response) {
      try {
        debug('下载成功:', file.link)
        file.state = 2
        var index = that.loadList.indexOf(file)
        index >= 0 && that.loadList.splice(index, 1)
        file.hash = hash(response.body + '')
        that.emit('loaded', file, response)
        that.getLinks(file, response.body)
        that.loadNext()
        that.save()
      } catch (e) {
        console.log(e)
        that.emit('error', e)
      }

      return this
    }

    function loadFail (err) {
      try {
        var index = that.loadList.indexOf(file)
        index >= 0 && that.loadList.splice(index, 1)
        file.reTryTime = (file.reTryTime + 1) || 1
        debug('下载失败:', file.link)
        that.emit('load_fail', file, err)
        if (file.reTryTime > that.config.reTryTime) {
          file.state = 3
        } else {
          file.state = 0
        }
        that.loadNext()
        that.save()
      } catch (e) {
        console.log(e)
        that.emit('error', e)
      }
    }
  }

    /**
     * 继续下载下一个文件
     */
  loadNext () {
    var that = this
    setTimeout(function () {
      if (that.state === 'load') that.load()
    }, 1000)
  }

    /**
     * 停止下载文件
     */
  stop () {
    this.state = 'stop'
  }

    /**
     * 更新文件状态
     * - 首页配置为未下载
     * - todo: 判断带有hash的文件是否需要下载,例如 a.js?abc=12
     * */
  update (link) {
    if (!link) link = this.config.url
    if (!link) return this
    var file = this.absolute(link)
    if (!file) return this
    file = this.db.links[file.link]
    if (file) {
      file.state = 0
      file.loadTimes = 0
      this.save()
    } else {
      this.pushLink(link)
    }
        // 清空未下载文件的下载次数
    var links = this.db.links
    for (link in links) {
      file = links[link]
      if (file.state !== 2) {
        file.state = 0
        file.reTryTime = 0
      }
    }
  }

  has (link) {
    return this.links[link]
  }

  remove (link) {
    var file = this.links[link]
    if (file) {
      var index = this.list.indexOf(file)
      index >= 0 && this.list.splice(index, 1)
      index = this.loadList.indexOf(file)
      index >= 0 && this.loadList.splice(index, 1) && this.emit('load_fail', file)
      delete this.links[link]
    }
    return this
  }

    // 清空下载记录
  clean () {
    this.db.list = []
    this.db.links = {}
    this.save()
    return this
  }
}

const headers = {
    // "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  'Accept-Language': 'zh-CN,zh;q=0.8,en;q=0.6,zh-TW;q=0.4',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36'
}

function relative (path, dest) {
  return Path.relative(path, dest).substr(1)
}

function loadAndSave (href, saveTo, timeout) {
    // debug('loadAndSave:', href, saveTo);
  return new Promise(function (resolve, reject) {
    if (saveTo.indexOf('?') >= 0) saveTo = saveTo.substr(0, saveTo.indexOf('?'))
    if (isDir(saveTo)) return reject(new Error('saveTo path is directory...'))
    try {
      mkdir(saveTo.substr(0, saveTo.lastIndexOf('/')))
    } catch (e) {
      console.warning(e)
    }
    setTimeout(reject, timeout || 100000)
    request({
      url: encodeURI(href),
      method: 'get',
      gzip: false,
      headers: headers,
      timeout: timeout,
      encoding: null
    }, function (err, response, body) {
      if (err || (response && response.statusCode !== 200)) {
        reject(err || response)
      } else {
        fs.writeFileSync(saveTo, body)
        resolve(response)
      }
    })
  })
}

module.exports = Spider
