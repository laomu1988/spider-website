const Event = require('events')
const Url = require('url')
const Path = require('path')
const _ = require('lodash')
const temp = require('temp-data')
const mkdir = require('mk-dir')
const debug = require('debug')('spider')
const death = require('death')
const File = require('./file')

/**
 * 文件loadState: 等待下载0, 下载中1,下载成功2,下载失败3, 无需下载-1
 *
 * */

const config = {
  url: '',                // 启动地址
  host: '',               // 仅下载该域名下内容,默认和url中host一致
  temp: 'spider.json',    // 缓存文件,存放下载列表
  autoName: 'index.html', // 自动增加扩展名
  saveTo: './spider/',    // 下载文件保存路径
  savePathIgnore: '',        // 保存时仅保存该路径下内容
  request: undefined,     // request时带有的参数
  autoLinks: true,       // 是否自动根据html引入文件
  saveHistory: true,      // 保存文件下载历史
  // autoEncode: true,     // 自动将文件编码转换为utf8
  // autoExit:   true      // 下载完毕自动退出程序
  autoRelative: false,  // 将文件引用地址转换为相对地址
  autoCover: true,       // 已经存在文件则覆盖
  deep: 10,               // 最多加载深度
  speed: 10,              // 同时下载多少个文件
  reTryTime: 10,          // 最多重试次数
  isGBK: false,           // 是否是gbk编码
  listSaveTime: 600 * 1000, // 列表保存间隔时间
  timeout: 100000         // 下载超时时间
}
var defaultTemp = {
  config: config,
  links: {}, // 链接列表
  list: [] // 链接列表
};

const listenEvent = ['before_save'];
class Spider extends Event {
  constructor (_config) {
    super()

    if (typeof _config === 'string') {
      _config = {url: _config}
    }
    _config = _.extend(config, _config)

    var startUrl = _config.url
    if (!_config.host) {
      _config.host = Url.parse(startUrl).host
    }
    File.setConfig(_config)

    mkdir(config.saveTo + '/')
    var listSavePlace = Path.resolve(config.saveTo + '/', _config.temp);
    var db = temp(listSavePlace, defaultTemp, {timeout: _config.listSaveTime})
    this.db = db
    this.config = _config
    this.loadState = '' // 文件下载状态： 默认空， load： 下载中，stop： 停止下载
    this.loadList = []  // 正在下载的文件列表
    this.list = db.list || [];
    this.links = db.links || {};
    if (this.config.url) {
      this.push(this.config.url)
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
    if(this.config.saveHistory) {
      this.db.list = this.list;
      this.db.links = this.links;
      this.db.config = this.config;
      this.db.$save(isRightNow)
    }
    return this;
  }

  /**
   * 添加新连接
   * @param href: 链接链接地址
   * @param old:  引用该文件的文件
   *
   * @return file: 文件对象或者false(返回false表示不符合添加规范)
   * */
  push (href, old) {
    var me = this;
    debug('push', href, old && old.href)
    if(!href) return false;
    if(old && old.deep >= this.config.deep){
      debug('push too deep:',old.depp)
      return false;
    }
    var file = href.href ? href : new File(href, this.config);
    if(!file || !file.href) {
      debug('push no href:',file);
      return false;
    }
    if (file.host !== this.config.host || (_.isArray(this.config.host) && this.config.host.indexOf(file.host) < 0)) {
      debug('href host is NOT in config.host ..', file.host, this.config.host)
      return false;
    }
    if(this.links[file.link]) return this.links[file.link]
    this.emit('push_before', file)
    if(!file.link) return false
    this.links[file.link] = file
    this.list.push(file.link)
    listenEvent.forEach(function(event){
      file.on(event, function(file) {
        me.emit(event, file)
      })
    })
    this.emit('push', file)
    return file;
  }
  getNeedLoad () {
    var me = this;
    if (!me._needLoaded || me._needLoaded.length === 0) {
      var links = me.links
      me._needLoaded = me.list.map(function (href) {
        return links[href]
      }).filter(function (a) {
        return !a.loadState || (a.loadState === 3 && a.reTryTime < me.config.reTryTime);
      })
    }
    if (this._needLoaded && this._needLoaded.length > 0) {
      return this._needLoaded.pop()
    }
    me.emit('load_finish',me)
    return false
  }
  onLoadSuccess(file) {
    var me = this;
    try {
      debug('下载成功:', file.href)
      var index = me.loadList.indexOf(file)
      index >= 0 && me.loadList.splice(index, 1)
      me.emit('loaded', file)
      if(me.config.autoLinks) {
        var links = file.getLinks();
        for(var i = 0; links && i<links.length;i++) {
          me.push(links[i]);
        }
      }
      me.loadNext()
      me.save()
    } catch (e) {
      console.log('load-success:',e)
      me.emit('error', e)
    }
  }
  onLoadFailure(file) {
    var me = this;
    try {
      debug('下载失败:', file.href)
      var index = me.loadList.indexOf(file)
      index >= 0 && me.loadList.splice(index, 1)
      me.emit('load_fail', file, file.err || file.response)
      me.loadNext()
      me.save()
    } catch (e) {
      console.log('loadfail:',e)
      me.emit('error', e)
    }
  }
  load (file) {
    var me = this
    if(typeof file === 'string') file = new File(file, this.config);
    else if(!file) {
      me.loadState = 'load'
      if (me.loadList.length >= me.config.speed)
      {
        debug('load: load list to long.',me.loadList.length, me.config.speed);
        return me
      }
      file = me.getNeedLoad()
    }
    if (!file || !file.href) {
      debug('load: has no load file');
      return me
    }
    me.loadList.push(file)
    me.emit('load_before', file)
    file.load().then(me.onLoadSuccess.bind(me), me.onLoadFailure.bind(me)).catch(function(){
      me.onLoadFailure(file);
    });
  }

  /**
   * 继续下载下一个文件
   */
  loadNext () {
    var that = this
    debug('loadnext-crate:',that.loadState);
    setTimeout(function () {
      debug('loadnext:',that.loadState);
      if (that.loadState === 'load') that.load()
    }, 1000)
  }

    /**
     * 停止下载文件
     */
  stop () {
    this.loadState = 'stop'
  }

  // 更新所有html文件
  updateHTML() {

  }
  // 根据路径查找file
  getFile(href) {
    if(this.links[href]) return this.links[href];
    var file = href.link ? href : new File(href, this.config);
    if(this.links[file.link]) return this.links[file.link];
    return false;
  }
  has (href) {
    return !!this.getFile(href);
  }

  remove (href) {
    var file = this.getFile(href)
    if (file) {
      var link = file.link;
      var index = this.list.indexOf(link)
      index >= 0 && this.list.splice(index, 1)
      index = this.loadList.indexOf(file)
      index >= 0 && this.loadList.splice(index, 1) && this.emit('load_fail', file)
      delete this.links[link]
    }
    return this
  }

  // 清空下载记录
  clean () {
    this.links = {};
    this.list = [];
    this.save()
    return this
  }
}

module.exports = Spider
