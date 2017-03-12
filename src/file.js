/**
 * 文件对象
 *    新建对象
 *    从json中建立对象
 *    计算保存地址
 *    文件下载
 *    转换地址为相对地址
 *    触发事件
 *       init
 *       load_before
 *       loaded
 *       load_fail
 *       convert
 * */
const URL = require('url')
const isDir = require('is-dir')
const mkdir = require('mk-dir')
const request = require('request')
const fs = require('fs')
const Path = require('path')
const Hash = require('object-hash')
const getLinks = require('ctx-links')
const convert = require('convert-relative')
const Event = require('events')
const debug = require('debug')('spider-file')
const decode = require('iconv-lite').decode;
const initState = {
  loaded: false,
  loadState: 0,  // 下载状态，0：未开始，1：下载中，2： 下载完毕  3： 下载失败
  reTryTime: 0
}
const saveAttrs = ['href','loaded','data','reTryTime','hash','data', 'saveTo'];
const parseAttr = ['host','pathname','href','protocol'];

let defaultOpts = {};
class File extends Event {
  static setConfig(opts) {
    defaultOpts = opts;
  }
  constructor (urlORData, opts) {
    debug('new file:',urlORData)
    super()
    this.init(urlORData, Object.assign({}, opts,defaultOpts));
    debug('init file finished')
    return this;
  }
  init(data, opts) {
    if(!data) throw new Error('File.init(url,[opts]) nead url.');
    if(typeof data !== 'string' && typeof data.href !== 'string') throw new Error('File.init(url,[opts]) nead url.');
    var parse = URL.parse(typeof data === 'string' ? data : data.href);
    var me = this;
    parseAttr.forEach(function(attr){
      me[attr] = parse[attr]
    });
    for(let attr in data) {
      if(saveAttrs.indexOf(attr) >= 0) me[attr] = data[attr] || initState[attr];
    }
    me.link = me.protocol + '//' + me.host + me.pathname;
    me.opts = opts || defaultOpts;
    if(!me.saveTo) me.saveTo = me.getSavePath();
    return me;
  }
  toJSON(){
    var me = this;
    var obj = {};
    saveAttrs.forEach(function(attr) {
      obj[attr] = me[attr];
    });
    return JSON.stringify(obj)
  }
  getSavePath() {
    if(this.saveTo) return this.saveTo;
    // 判断是否需要增加扩展名
    var pathname = this.pathname || '';
    var extname = Path.extname(pathname);
    if(this.opts.autoName && (pathname[pathname.length -1 ] === '/' || !extname)) {
      pathname += '/' + this.opts.autoName;
      extname = Path.extname(extname);
    }
    var index = this.opts.savePathIgnore && pathname.indexOf(this.opts.savePathIgnore)
    if (index === 0) pathname = pathname.substr(this.opts.savePathIgnore.length - 1)
    var saveTo = Path.resolve(this.opts.saveTo + '/' + pathname);
    if (isDir(saveTo)) throw new Error('saveTo path is directory...');
    return saveTo;
  }

  load () {
    var me = this;
    debug('load:',this.href);
    return new Promise(function (resolve, reject) {
      me.reTryTime = (me.reTryTime + 1) || 1;
      me.loadState = 1;
      setTimeout(function() {
        debug('load timeout', me.opts.timeout || 100000)
        if(me.loadState == 1) {
          me.loadState = 3;
          me.err = new Error('timeout');
        }
        reject(me);
      }, me.opts.timeout || 100000)
      try{
        var params = Object.assign({
          url: encodeURI(me.href),
          method: 'get',
          gzip: false,
          headers: headers,
          encoding: null
        }, me.opts.request,me.data ? me.data.request : null);
        // debug('request:',params);
        request(params, function (err, response) {
          debug('response:', err, response.statusCode)
          if (err || response.statusCode !== 200) {
            me.loadState = 3;
            me.err = err;
            me.response = response;
            reject(me)
          } else {
            try {
              mkdir(me.saveTo.substr(0, me.saveTo.lastIndexOf('/')))
              var hash = me.hash;
              let body = response.body
              if(me.opts.isGBK && me.isText()) {
                body = decode(body, 'gbk');
              }
              me.hash = Hash(body + '')
              me.response = response;
              me.loadState = 2;
              if (me.hash != hash) response.hasUpdated = true;
              if (me.opts.autoRelative && me.isHTML()) {
                let result = convert.html(body + '', me.href)
                debug('autoRelative', me.href, result.changed)
                debug('autoRelative:', result.links)
                body = result.html
              }
              me.body = body
              if (me.saveTo) {
                me.emit('before_save', me)
                fs.writeFileSync(me.saveTo, me.body)
              }
              resolve(me)
            } catch (e) {
              console.warning(e)
              reject(me)
            }
          }
        })
      }catch(e){
        debug('load-error:',e);
        me.err = e;
        reject(me);
      }
    })
  }
  // 读取content
  getBody(encode) {
    if(this.body) return this.body;
    if(fs.exist(this.saveTo)) return fs.readFileSync(this.saveTo, encode);
    return false;
  }
  isText(){
    if(this.response) {
      var contentType = this.response.headers['content-type'];
      debug('content-type:',contentType);
      if(/text|json|utf|gbk/.test(contentType)) return true;
      if(contentType.indexOf('image') >= 0) return false;
    }
    if(/(\.png|\.jpg|\.gif|\.woff|\.ico|\.ttf|\.eot)/.test(this.saveTo)) return false;
    if(/(\.htm|\.js|\.css|\.svg)/.test(this.saveTo)) return true;
    return false;
  }
  isHTML() {
    if(this.response) {
      var contentType = this.response.headers['content-type'];
      debug('html-content-type:',contentType);
      if(/htm/.test(contentType)) return true;
    }
    if(/(\.htm)/.test(this.saveTo)) return true;
    return false;
  }
  isCss() {
    if(this.response) {
      var contentType = this.response.headers['content-type'];
      debug('html-content-type:',contentType);
      if(/css/.test(contentType)) return true;
    }
    if(/(\.css)/.test(this.saveTo)) return true;
    return false;
  }
  isJs() {
    if(this.response) {
      var contentType = this.response.headers['content-type'];
      debug('html-content-type:',contentType);
      if(/javascript/.test(contentType)) return true;
    }
    if(/(\.js)/.test(this.saveTo)) return true;
    return false;
  }
  getLinks() {
    if(!this.isText()) return false;
    var body = this.getBody() + '';
    debug('links,body');
    if(body) {
      if(this.isHTML()) return getLinks.html(body, this.href);
      if(this.isCss()) return getLinks.css(body, this.href);
      return false;
    }
    return false;
  }
  // todo:保存文件
  // save(body, encode) {
  //
  // }
  /**
   * 是否有更新
   * @return [promise]
   */
  hasUpdated() {
    return this.load().then(function(response) {
      if(response && response.hasUpdated) return response;
      throw response;
    });
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

module.exports = File;
