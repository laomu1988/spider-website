# 网站爬虫（自动下载工具）


## 安装
安装node之后执行
```
npm install spider-website
```

## 使用说明
```
var config = {
    autoName: 'index.html', // 不存在扩展名时自动增加命名
    saveTo: __dirname + '/test/', // 下载文件保存路径
    deep: 10, // 下载深度
    speed: 10, // 下载速度，同时下载多少文件
    isGBK: false, // 是否是gbk编码

    beforePush: false, // 文件加入下载路径前调用，假如返回false，则不加入下载队列
    beforeLoad: false, // 下载文件前调用，返回false则不下载该文件
    onLoad: false, // 下载文件成功后调用，下载完毕后调用
    onFail: false // 下载文件失败后调用
};

spider.init(config);
spider.load('https://nodejs.org/dist/latest-v4.x/docs/api/index.html'); // 下载时起始网址
```
## 部分参数说明
* beforeLoad(obj) 下载文件前调用，返回false则不下载该文件，obj存在下列属性
    - link 下载的链接
    - saveTo  保存的位置
    - ext  扩展名
    - pathname 路径
    - loaded 是否下载完毕
* beforePush(link,obj) 文件加入下载路径前调用，假如返回false，则不加入下载队列
    - link 新加入的链接
    - obj 链接来自什么地方
* onLoad(obj)
* onFail(obj)