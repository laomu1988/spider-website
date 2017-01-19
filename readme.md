# 网站爬虫（自动下载工具）


## 安装
安装node之后执行
```
npm install spider-website -g
```


## 执行命令
```
spider weburl [--save folder]
```

## js使用说明
```
var Spider = require('spider-website');

// 下载起始网址
var index = 'http://laomu1988.github.io/index.html';

var spider = new Spider({url: index, saveTo: __dirname + '/save/'});
spider.clean();
spider.update(index);
spider.load();
```

## todo
* [x] 使用es6 class改写spider
* [x] 命令行下载数据: spider [website]
* [x] 文件中绝对路径改为相对路径
* 本地数据库存储
    - [x] 本次配置,配置是否变更
    - [ ] 要下载的文件列表
    - [ ] 文件状态更新
    - [ ] 是否存在未下载的文件
* [ ] 取消配置文件编码,当时gbk时下载文件完毕后自动转换为utf8格式
* 文件链接解析
    - [ ] html文件引入其他: html,js,css,img
    - [ ] css文件引入img
* 判断文件变更: hash或者query变化