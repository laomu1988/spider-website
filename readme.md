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


## todo
* [x] 使用es6 class改写spider
* [x] 命令行下载数据: spider [website]
* [x] 文件中绝对路径改为相对路径
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
