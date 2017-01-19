#!/usr/bin/env node
/**
 * node命令行参考: http://www.ruanyifeng.com/blog/2015/05/command-line-with-node.html
 * 规则：
 *          - id： 判断是否存在config.json，从中读取
 *          - zip：判断执行命令的文件夹及子文件夹中是否存在zip文件，并且文件名中包含了id，假如存在多个，则取第一个
 * */
var package = require('../package.json');
var fs = require('fs');
var argv = require('yargs')
    .option('s', {alias: 'save', demand: false, type: 'string', describe: '存放目录'})
    .usage('Usage: spider website [--save folder]')
    .example('spider http://laomu1988.github.io/index.html --save laomu')
    .help('h')
    .alias('h', 'help')
    .epilog('View Details: \n')
    .argv;

console.log('You Are Run spider v' + package.version, ', view detail: https://github.com/laomu1988/spider-website');


var config = {};
if (!argv._ || !argv._[0]) {
    return false;
}
config.url = argv._[0];
if (argv.save) {
    config.saveTo = './' + argv.save;
}

var Spider = require('../lib/spider');
var spider = new Spider(config);
spider.update(config.url);
spider.load();