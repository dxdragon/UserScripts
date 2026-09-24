// ==UserScript==
// @name        论坛悬浮回复框
// @description 常用论坛的悬浮回复框，点击固定，再次点击缩回
// @namespace
// @author       Shay
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
        AT_X:   10,    // 图标左边缘相对 #wp 右边缘的偏移（正=越出 wp 往右）
        AT_Y:   -40,   // 距视口底部 40px
    };

    const EDGE_PADDING = 5;

    const DEFAULT_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%234a90e2'/%3E%3Cpath d='M14 18H50V46H28L18 56V46H14Z' fill='%23fff'/%3E%3Ccircle cx='24' cy='32' r='3' fill='%234a90e2'/%3E%3Ccircle cx='32' cy='32' r='3' fill='%234a90e2'/%3E%3Ccircle cx='40' cy='32' r='3' fill='%234a90e2'/%3E%3C/svg%3E";

    const TARGET_SELECTORS = [
        '#anchor',
        '#quickpost',
        '#f_pst',
        '#f_post',
        '#fast_post_c',
        'form[action="post.php?"][method="post"] > .t5',
    ];

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
     *  样式（关键：回复框相关都加 !important，防止被论坛覆盖）
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

    /* =========================================================
     *  工具：带 !important 设置样式
     * ========================================================= */

    const setStyle = (el, props) => {
        for (const [k, v] of Object.entries(props)) {
            el.style.setProperty(k, v, 'important');
        }
    };

    /* =========================================================
     *  设置面板
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
     *  布局辅助
     * ========================================================= */

    const getWpRect = () => {
        const wp = document.querySelector('#wp');
        if (!wp) return null;
        const r = wp.getBoundingClientRect();
        if (r.width < 100) return null;
        return r;
    };

    /* =========================================================
     *  悬浮回复框
     * ========================================================= */

    class FloatingReply {
        constructor(target, settingsPanel) {
            this.target = target;
            this.settingsPanel = settingsPanel;
            this.expanded = false;
            this.icon = null;
            this._hideTimer = null;
            this._build();
        }

        _build() {
            const width   = getInt(KEYS.WIDTH, DEF.WIDTH);
            const height  = getInt(KEYS.HEIGHT, DEF.HEIGHT);
            const iconUrl = getStr(KEYS.URL, '') || DEFAULT_ICON;

            this.target.classList.add('frep_reply');
            this.target.dataset.expand = '0';

            // 表单提交后自动收起
            const form = this.target.tagName === 'FORM'
                ? this.target
                : this.target.querySelector('form');
            if (form) {
                form.addEventListener('submit', () => {
                    setTimeout(() => this.collapse(), 50);
                });
            }

            // 创建图标
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

            this._layoutIcon();
            this._bindEvents();
        }

        /** 图标定位：优先贴 #wp 右边缘；无 #wp 则贴视口右侧 */
        _layoutIcon() {
            const width  = getInt(KEYS.WIDTH, DEF.WIDTH);
            const height = getInt(KEYS.HEIGHT, DEF.HEIGHT);
            const atX    = getInt(KEYS.AT_X, DEF.AT_X);
            const atY    = getInt(KEYS.AT_Y, DEF.AT_Y);
            const bodyW  = document.body.clientWidth;
            const bodyH  = document.body.clientHeight;

            let iconLeft;
            const wp = getWpRect();
            if (wp) {
                iconLeft = wp.right + atX;
            } else {
                iconLeft = bodyW - width - Math.abs(atX || EDGE_PADDING);
            }

            const maxLeft = Math.max(EDGE_PADDING, bodyW - width - EDGE_PADDING);
            iconLeft = Math.min(Math.max(iconLeft, EDGE_PADDING), maxLeft);

            const props = {
                'left':   `${Math.round(iconLeft)}px`,
                'right':  'auto',
                'top':    atY >= 0 ? `${atY}px` : 'auto',
                'bottom': atY >= 0 ? 'auto' : `${Math.min(Math.abs(atY), bodyH - height - EDGE_PADDING)}px`,
                'width':  `${width}px`,
                'height': `${height}px`,
            };
            setStyle(this.icon, props);
        }

        /** 回复框定位：与 #wp 完全同宽同左 */
        _layoutReply() {
            const wp = getWpRect();
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

            // 额外强制项，防止论坛样式干扰
            setStyle(t, {
                'box-sizing': 'border-box',
                'margin':     '0',
                'max-width':  'none',
                'min-width':  '0',
                'float':      'none',
            });
        }

        refreshLayout() {
            this._layoutIcon();
            if (this.expanded) this._layoutReply();
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

            icon.addEventListener('mouseenter', () => this._cancelHide());
            icon.addEventListener('mouseleave', () => this._scheduleHide());
            target.addEventListener('mouseenter', () => this._cancelHide());
            target.addEventListener('mouseleave', () => this._scheduleHide());
        }

        _cancelHide() {
            clearTimeout(this._hideTimer);
            if (!this.expanded) this._show();
        }

        _scheduleHide() {
            if (this.expanded) return;
            clearTimeout(this._hideTimer);
            this._hideTimer = setTimeout(() => this._hide(), 200);
        }

        toggle() { this.expanded ? this.collapse() : this.expand(); }

        expand() {
            this.expanded = true;
            this._show();
            this.icon.dataset.expand = '1';
        }

        collapse() {
            this.expanded = false;
            this._hide();
            this.icon.dataset.expand = '0';
        }

        /** 统一入口：任何展开路径都会重排 */
        _show() {
            this._layoutReply();
            this.target.dataset.expand = '1';
        }

        _hide() {
            this.target.dataset.expand = '0';
        }
    }

    /* =========================================================
     *  初始化 & 动态 DOM 支持
     * ========================================================= */

    const init = () => {
        injectStyleOnce();

        const panel = new SettingsPanel();
        GM_registerMenuCommand('设置论坛回复悬浮窗属性', () => panel.toggle());

        /** @type {FloatingReply[]} */
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
            for (const selector of TARGET_SELECTORS) {
                tryInit(document.querySelector(selector));
            }
        };

        scan();

        // 动态加载的回复框（AJAX 场景）
        let scheduled = false;
        const observer = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                scan();
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // 窗口大小变化 → 重排所有实例
        let resizeScheduled = false;
        window.addEventListener('resize', () => {
            if (resizeScheduled) return;
            resizeScheduled = true;
            requestAnimationFrame(() => {
                resizeScheduled = false;
                for (const r of instances) r.refreshLayout();
            });
        });

        // ESC 关闭全部
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.keyCode === 27) {
                for (const r of instances) r.collapse();
                panel.close();
            }
        });
    };

    init();
})();