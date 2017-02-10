# 网站爬虫（自动下载工具）


## 安装
安装node之后执行
```
npm install spider-website -g
```


## 命令行
```
spider weburl [--save folder]
```
下载 weburl 网站及相关链接到 folder目录下， 默认保存到spider目录

## js使用说明
```
var Spider = require('spider-website');

// 下载起始网址
var index = 'http://laomu1988.github.io/index.html';

var spider = new Spider({url: index, saveTo: __dirname + '/save/'});
spider.clean();
spider.update(index); // 重新下载某个链接
spider.load();
```

## config
* url: 下载起始链接
* saveTo: 保存文件目录

## api
* clean:  清空下载历史数据
* update: 更新数据
* load:   开始下载

## data
* spider.config: 配置内容
* spider.links: {link: file} 所有文件及其状态，改对象的key是文件的下载地址
* spider.list: [link,link],所有下载的或者未下载的文件列表
* file  spider.links中的文件
    - link: 下载地址
    - host: 网址host
    - pathname： 网址路径
    - query: 加载改地址的query，例如`a.js?hash=123`,则query为`hash=123`,link中没有存放该内容
    - ext:  文件扩展名
    - saveTo: 文件保存地址，不包括config.saveTo的部分
    - state：  文件下载状态，0：未下载，1：下载中，2：下载成功， 3：下载失败
    - reTryTime: 重试了多少次

## todo
* [x] 使用es6 class改写spider
* [x] 命令行下载数据: spider [website]
* [x] 文件中绝对路径改为相对路径
* [ ] 下载地址为网站的某一个子目录下文件则默认配置为只下载该子目录下的文件，其他文件仍然指向原网址
* 本地数据库存储
    - [x] 本次配置,配置是否变更
    - [x] 要下载的文件列表
    - [x] 文件状态更新
    - [ ] 是否存在未下载的文件
* [ ] 取消配置文件编码,当时gbk时下载文件完毕后自动转换为utf8格式
* 文件链接解析
    - [x] html文件引入其他: html,js,css,img
    - [ ] css文件引入img
* 判断文件变更: hash或者query变化
    - [ ] query变更
    - [ ] 文件内容变更
* api
    - [ ] 取得所有文件
* 事件
    - [ ] 下载完毕事件
    - [ ] 解析完毕事件
