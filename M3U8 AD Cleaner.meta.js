// ==UserScript==
// @name              M3U8 AD Cleaner
// @namespace         http://tampermonkey.net/
// @version           1.0
// @description       拦截和过滤 m3u8 切片广告，支持导出无广告播放列表
// @author            Shay
// @match             *://*/*
// @exclude           *://challenges.cloudflare.com/*
// @exclude           *://*/recaptcha/*
// @exclude           *://*.geetest.com/*
// @exclude           *://*.hcaptcha.com/*
// @run-at            document-start
// @grant             unsafeWindow
// @grant             GM_registerMenuCommand
// @grant             GM_unregisterMenuCommand
// @grant             GM_setValue
// @grant             GM_getValue
// @grant             GM_addStyle
// @license           MIT
// @downloadURL       https://raw.githubusercontent.com/dxdragon/UserScripts/main/M3U8%20AD%20Cleaner.user.js
// ==/UserScript==