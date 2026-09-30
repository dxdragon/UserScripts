// ==UserScript==
// @name        论坛悬浮回复框
// @description 常用论坛的悬浮回复框，点击固定，再次点击缩回
// @namespace   https://github.com/dxdragon/UserScripts
// @author      Shay
// @match       *://*/*thread*
// @match       *://*/*forum*
// @match       *://*/*bbs*
// @match       *://*/*discuz*
// @match       *://*/*phpbb*
// @match       *://*/*topic*
// @match       *://*/*discussions*
// @match       *://*/*questions*
// @match       *://*.znds.com/tv-*
// @version     1.0
// @run-at      document-end
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @updateURL    https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/float_bbs_reply.user.js
// @downloadURL  https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/float_bbs_reply.user.js
// ==/UserScript==

(() => {
    'use strict';

    /* =========================================================
     *  常量
     * ========================================================= */

    const KEYS = {
        URL:    'check_mUrl',
        WIDTH:  'check_mWidth',
        HEIGHT: 'check_mHeight',
        AT_X:   'check_mAtX',
        AT_Y:   'check_mAtY',
    };

    const DEF = {
        WIDTH:  30,
        HEIGHT: 30,
        AT_X:   10,
        AT_Y:   -40,
    };

    const EDGE_PADDING = 5;

    const DEFAULT_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%234a90e2'/%3E%3Cpath d='M14 18H50V46H28L18 56V46H14Z' fill='%23fff'/%3E%3Ccircle cx='24' cy='32' r='3' fill='%234a90e2'/%3E%3Ccircle cx='32' cy='32' r='3' fill='%234a90e2'/%3E%3Ccircle cx='40' cy='32' r='3' fill='%234a90e2'/%3E%3C/svg%3E";

    // 合并成一个复合选择器，一次 querySelectorAll
    const TARGET_SELECTOR = [
        '#anchor',
        '#quickpost',
        '#f_pst',
        '#f_post',
        '#fast_post_c',
        'form[action="post.php?"][method="post"] > .t5',
    ].join(',');

    /* =========================================================
     *  配置读写
     * ========================================================= */

    const getInt = (key, fallback) => {
        const n = Number.parseInt(GM_getValue(key, String(fallback)), 10);
        return Number.isFinite(n) ? n : fallback;
    };

    const getStr = (key, fallback) => GM_getValue(key, fallback);
    const setVal = (key, value) => GM_setValue(key, String(value));

    /* =========================================================
     *  样式（与 1.1 保持一致）
     * ========================================================= */

    const STYLE = `
        .frep_btn {
            position: fixed !important;
            z-index: 2147483000 !important;
            border: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background-repeat: no-repeat !important;
            background-size: 100% 100% !important;
            overflow: hidden !important;
            cursor: pointer !important;
            opacity: .75;
            transition: opacity .2s;
            box-sizing: border-box !important;
        }
        .frep_btn:hover,
        .frep_btn[data-expand="1"] { opacity: 1; }

        .frep_reply {
            position: fixed !important;
            bottom: -5px !important;
            z-index: 2147483000 !important;
            height: auto !important;
            overflow: hidden !important;
            background: #fcfcfc !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            max-width: none !important;
            min-width: 0 !important;
            transition: opacity .2s;
            float: none !important;
        }
        .frep_reply[data-expand="0"] { display: none !important; }
        .frep_reply[data-expand="1"] { display: block !important; }

        .frep_panel {
            position: fixed;
            inset: 0;
            margin: auto;
            width: 520px;
            max-width: 92vw;
            height: fit-content;
            max-height: 90vh;
            overflow: auto;
            padding: 16px;
            font-size: 14px;
            color: #000;
            background: rgba(255, 255, 255, .96);
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 2px 2px 8px rgba(0, 0, 0, .4);
            text-align: center;
            user-select: none;
            z-index: 2147483600;
        }
        .frep_panel .hint { font-size: 12px; color: #666; margin-bottom: 12px; }
        .frep_panel .row {
            display: flex; align-items: center; justify-content: center;
            gap: 8px; margin: 8px 0;
        }
        .frep_panel label { flex: 0 0 260px; text-align: right; }
        .frep_panel input[type="text"] { flex: 1; padding: 4px 8px; font-size: 14px; }
        .frep_panel .buttons {
            margin-top: 16px; display: flex; justify-content: center; gap: 12px;
        }
        .frep_panel button { padding: 6px 20px; font-size: 14px; cursor: pointer; }
    `;

    const injectStyleOnce = () => {
        if (document.getElementById('frep-style')) return;
        const el = document.createElement('style');
        el.id = 'frep-style';
        el.textContent = STYLE;
        (document.head || document.documentElement).appendChild(el);
    };

    const setStyle = (el, props) => {
        for (const [k, v] of Object.entries(props)) {
            el.style.setProperty(k, v, 'important');
        }
    };

    /* =========================================================
     *  设置面板（未改动）
     * ========================================================= */

    class SettingsPanel {
        constructor() { this.el = null; }

        isOpen() { return this.el !== null; }

        toggle() { this.isOpen() ? this.close() : this.open(); }

        close() {
            this.el?.remove();
            this.el = null;
        }

        open() {
            if (this.isOpen()) return;

            const panel = document.createElement('div');
            panel.className = 'frep_panel';

            const hint = document.createElement('div');
            hint.className = 'hint';
            hint.textContent = '回复框与 #wp 同宽、左右对齐；X 偏移为图标左边缘相对 #wp 右边缘的距离（正=越出 wp 往右，负=进入 wp 内部）。留空图标地址则使用内置聊天气泡。保存后刷新页面生效。';
            panel.appendChild(hint);

            const fields = [
                { key: KEYS.URL,    label: '图标地址（留空用默认）：',    type: 'url', value: getStr(KEYS.URL, '') },
                { key: KEYS.AT_X,   label: '图标距 #wp 右边缘偏移：',     type: 'int', value: getInt(KEYS.AT_X, DEF.AT_X) },
                { key: KEYS.AT_Y,   label: '图标距上/下距离（上正下负）：', type: 'int', value: getInt(KEYS.AT_Y, DEF.AT_Y) },
                { key: KEYS.WIDTH,  label: '图标宽度：',                  type: 'int', value: getInt(KEYS.WIDTH, DEF.WIDTH) },
                { key: KEYS.HEIGHT, label: '图标高度：',                  type: 'int', value: getInt(KEYS.HEIGHT, DEF.HEIGHT) },
            ];

            const inputs = {};

            for (const f of fields) {
                const row = document.createElement('div');
                row.className = 'row';

                const label = document.createElement('label');
                label.textContent = f.label;
                row.appendChild(label);

                const input = document.createElement('input');
                input.type = 'text';
                input.value = f.value;

                if (f.type === 'int') {
                    input.inputMode = 'numeric';
                    input.addEventListener('input', () => {
                        let v = input.value.replace(/[^\d-]/g, '');
                        v = v.replace(/(?!^)-/g, '');
                        input.value = v;
                    });
                }

                row.appendChild(input);
                panel.appendChild(row);
                inputs[f.key] = input;
            }

            const btnRow = document.createElement('div');
            btnRow.className = 'buttons';

            const saveBtn = document.createElement('button');
            saveBtn.textContent = '保存';
            saveBtn.addEventListener('click', () => this._save(inputs));

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.addEventListener('click', () => this.close());

            btnRow.append(saveBtn, cancelBtn);
            panel.appendChild(btnRow);

            document.body.appendChild(panel);
            this.el = panel;
        }

        _save(inputs) {
            const urlValue = inputs[KEYS.URL].value.trim();

            if (urlValue) {
                if (!/^(https?:|data:image\/)/i.test(urlValue)) {
                    alert('图标地址必须以 http(s):// 或 data:image/ 开头，或留空使用默认图标');
                    return;
                }
                try {
                    if (/^https?:/i.test(urlValue)) new URL(urlValue);
                } catch {
                    alert('图标地址不规范');
                    return;
                }
            }

            const intKeys = [KEYS.AT_X, KEYS.AT_Y, KEYS.WIDTH, KEYS.HEIGHT];
            for (const k of intKeys) {
                if (!/^-?\d+$/.test(inputs[k].value.trim())) {
                    alert('请输入整数');
                    return;
                }
            }

            setVal(KEYS.URL, urlValue);
            for (const k of intKeys) {
                setVal(k, Number.parseInt(inputs[k].value, 10));
            }

            this.close();
            location.reload();
        }
    }

    /* =========================================================
     *  布局辅助（读一次，多处复用，减少强制回流）
     * ========================================================= */

    const getWpRect = () => {
        const wp = document.querySelector('#wp');
        if (!wp) return null;
        const r = wp.getBoundingClientRect();
        return r.width >= 100 ? r : null;
    };

    /* =========================================================
     *  悬浮回复框
     * ========================================================= */

    class FloatingReply {
        constructor(target, settingsPanel) {
            this.target = target;
            this.settingsPanel = settingsPanel;
            this.expanded = false;    // 用户主动固定
            this.hovering = false;    // 鼠标在图标/回复框内
            this.composing = false;   // 输入法组合中
            this.icon = null;
            this._hideTimer = null;
            this._lastExpand = null;  // 缓存展开状态，避免冗余写 DOM
            this._build();
        }

        _build() {
            const width   = getInt(KEYS.WIDTH, DEF.WIDTH);
            const height  = getInt(KEYS.HEIGHT, DEF.HEIGHT);
            const iconUrl = getStr(KEYS.URL, '') || DEFAULT_ICON;

            this.target.classList.add('frep_reply');
            this.target.dataset.expand = '0';

            const form = this.target.tagName === 'FORM'
                ? this.target
                : this.target.querySelector('form');
            if (form) {
                form.addEventListener('submit', () => {
                    setTimeout(() => this.collapse(), 50);
                });
            }

            const icon = document.createElement('div');
            icon.className = 'frep_btn';
            icon.dataset.expand = '0';
            icon.title = '点击展开/收起，右键打开设置';

            setStyle(icon, {
                'width':  `${width}px`,
                'height': `${height}px`,
                'background-image': `url("${iconUrl}")`,
            });

            this.target.parentNode.insertBefore(icon, this.target.parentNode.firstChild);
            this.icon = icon;
            this._lastExpand = '0';

            this._layoutIcon();
            this._bindEvents();
        }

        /** 图标定位（wp 参数可复用，避免重复读 rect） */
        _layoutIcon(wp) {
            if (wp === undefined) wp = getWpRect();

            const width  = getInt(KEYS.WIDTH, DEF.WIDTH);
            const height = getInt(KEYS.HEIGHT, DEF.HEIGHT);
            const atX    = getInt(KEYS.AT_X, DEF.AT_X);
            const atY    = getInt(KEYS.AT_Y, DEF.AT_Y);
            const bodyW  = document.body.clientWidth;
            const bodyH  = document.body.clientHeight;

            let iconLeft;
            if (wp) {
                iconLeft = wp.right + atX;
            } else {
                iconLeft = bodyW - width - Math.abs(atX || EDGE_PADDING);
            }

            const maxLeft = Math.max(EDGE_PADDING, bodyW - width - EDGE_PADDING);
            iconLeft = Math.min(Math.max(iconLeft, EDGE_PADDING), maxLeft);

            setStyle(this.icon, {
                'left':   `${Math.round(iconLeft)}px`,
                'right':  'auto',
                'top':    atY >= 0 ? `${atY}px` : 'auto',
                'bottom': atY >= 0 ? 'auto' : `${Math.min(Math.abs(atY), bodyH - height - EDGE_PADDING)}px`,
                'width':  `${width}px`,
                'height': `${height}px`,
            });
        }

        /** 回复框定位（wp 参数可复用） */
        _layoutReply(wp) {
            if (wp === undefined) wp = getWpRect();
            const t = this.target;

            if (wp) {
                setStyle(t, {
                    'left':   `${Math.round(wp.left)}px`,
                    'right':  'auto',
                    'width':  `${Math.round(wp.width)}px`,
                    'bottom': '-5px',
                });
            } else {
                setStyle(t, {
                    'left':   '5%',
                    'right':  '5%',
                    'width':  'auto',
                    'bottom': '-5px',
                });
            }

            setStyle(t, {
                'box-sizing': 'border-box',
                'margin':     '0',
                'max-width':  'none',
                'min-width':  '0',
                'float':      'none',
            });
        }

        refreshLayout() {
            if (!this.target.isConnected) return;   // 跳过已被移除的实例
            const wp = getWpRect();                 // 只读一次
            this._layoutIcon(wp);
            if (this._shouldShow()) this._layoutReply(wp);
        }

        _hasFocusInside() {
            const a = document.activeElement;
            return !!a && a !== document.body && this.target.contains(a);
        }

        _shouldShow() {
            return this.expanded || this.hovering || this.composing || this._hasFocusInside();
        }

        _bindEvents() {
            const { icon, target } = this;

            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });

            icon.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.settingsPanel.toggle();
            });

            const onEnter = () => {
                this.hovering = true;
                this._cancelHide();
                this._apply();
            };
            const onLeave = () => {
                this.hovering = false;
                this._scheduleHide();
            };

            icon.addEventListener('mouseenter', onEnter);
            icon.addEventListener('mouseleave', onLeave);
            target.addEventListener('mouseenter', onEnter);
            target.addEventListener('mouseleave', onLeave);

            target.addEventListener('focusin', () => {
                this._cancelHide();
                this._apply();
            });

            target.addEventListener('focusout', () => {
                setTimeout(() => {
                    if (this._hasFocusInside()) return;
                    this._scheduleHide();
                }, 0);
            });

            // 输入法组合事件：浮条抢焦点时保持展开
            target.addEventListener('compositionstart', () => {
                this.composing = true;
                this._cancelHide();
                this._apply();
            });
            target.addEventListener('compositionend', () => {
                this.composing = false;
            });
        }

        _cancelHide() {
            if (this._hideTimer) {
                clearTimeout(this._hideTimer);
                this._hideTimer = null;
            }
        }

        _scheduleHide() {
            this._cancelHide();
            if (this._shouldShow()) return;

            this._hideTimer = setTimeout(() => {
                this._hideTimer = null;
                if (this._shouldShow()) return;
                this._apply();
            }, 200);
        }

        toggle() { this.expanded ? this.collapse() : this.expand(); }

        expand() {
            this.expanded = true;
            this._cancelHide();
            this._apply();
        }

        collapse() {
            this.expanded = false;
            this.hovering = false;
            this._cancelHide();
            this._apply();
        }

        /** 统一入口：状态没变化时直接 return，避免冗余 DOM 写入 */
        _apply() {
            const show = this._shouldShow();
            const newVal = show ? '1' : '0';
            if (this._lastExpand === newVal) return;

            this._lastExpand = newVal;
            this.target.dataset.expand = newVal;
            this.icon.dataset.expand = newVal;

            if (show) this._layoutReply();
        }
    }

    /* =========================================================
     *  初始化 & 动态 DOM 支持
     * ========================================================= */

    const init = () => {
        injectStyleOnce();

        const panel = new SettingsPanel();
        GM_registerMenuCommand('设置论坛回复悬浮窗属性', () => panel.toggle());

        const instances = [];
        const initialized = new WeakSet();

        const tryInit = (node) => {
            if (!node || initialized.has(node)) return;
            try {
                instances.push(new FloatingReply(node, panel));
                initialized.add(node);
            } catch (err) {
                console.warn('[论坛悬浮回复框] 初始化失败：', err);
            }
        };

        const scan = () => {
            const nodes = document.querySelectorAll(TARGET_SELECTOR);
            for (const node of nodes) tryInit(node);
        };

        scan();

        // 优化：只对"新增节点"做响应 + 100ms setTimeout 防抖
        let scanTimer = null;
        const scheduleScan = () => {
            if (scanTimer) return;
            scanTimer = setTimeout(() => {
                scanTimer = null;
                scan();
            }, 100);
        };

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.addedNodes.length > 0) {
                    scheduleScan();
                    return;
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // resize：rAF 节流 + isConnected 过滤
        let resizeScheduled = false;
        window.addEventListener('resize', () => {
            if (resizeScheduled) return;
            resizeScheduled = true;
            requestAnimationFrame(() => {
                resizeScheduled = false;
                for (const r of instances) r.refreshLayout();
            });
        });

        // ESC：输入法组合中或焦点在回复框内时不响应
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' && e.keyCode !== 27) return;
            if (e.isComposing) return;
            const a = document.activeElement;
            if (a && a !== document.body && a.closest && a.closest('.frep_reply')) return;
            for (const r of instances) r.collapse();
            panel.close();
        });
    };

    init();
})();