# 🎐 Live2D Web Viewer · 液态玻璃

一个浏览器端的 Live2D 观赏器：**three.js** 驱动的动态背景与天气特效，**pixi-live2d-display** 渲染模型，整套 **液态玻璃（Liquid Glass）苹果风** 界面。支持多种模型格式导入、动作快捷键、预设背景、模型微调、本地音乐口型同步、多种内置滤镜，以及内置控制台日志。

---

## ✨ 功能一览

| 模块 | 说明 |
|------|------|
| 🧩 **多格式导入** | 纯导入驱动（不内置任何模型）：**模型文件夹 / 多个文件 / `.lpk` 加密包 / 背景图片**，可点击或直接拖拽。`.lpk` 在浏览器内**本地解密**，无需任何后端。 |
| 🕘 **导入历史** | 自动记录导入过的模型，一键再次加载；本会话内秒切，历史会话记录保留并可一键重新选择文件。 |
| 🎭 **动作快捷键** | 自动从模型读取**表情**与**动作组**，生成一键快捷按钮（带中文友好名），含随机播放。 |
| 🌅 **预设背景** | 12 套程序化渐变天空（晴空 / 黄昏 / 星夜 / 樱色 / 极光 …），含日月、星辰、视差浮动，可自定义渐变或上传图片。 |
| 🎚️ **模型微调** | 位置 X/Y、缩放、旋转、不透明度；鼠标视线跟随、呼吸眨眼、点击播放动作；自适应居中 / 重置。 |
| 🎵 **本地音乐** | 选择本地音频播放，含频谱可视化与 **Web Audio 口型同步**（嘴型随节奏开合）。 |
| ❄️ **天气特效** | three.js 粒子 **雨 / 雪 / 樱花**，可调密度、速度、风力、粒子大小，附地面雾气。 |
| 🎨 **内置滤镜** | 12 种成片滤镜（鲜艳 / 怀旧 / 黑白 / 赛博 / 樱粉 …）+ 亮度/对比度/饱和度/色相/模糊/怀旧/黑白手动调节，作用于整个画面。 |
| 🖥️ **控制台日志** | 实时日志面板，按级别过滤、自动滚动、一键复制 / 清空；捕获全局错误与 Cubism Core 输出。 |
| 🪟 **液态玻璃 UI** | 毛玻璃浮窗 + 底部 macOS 风格 Dock，面板可拖拽，布局与设置自动本地保存。 |

---

## 🚀 快速开始

> 因为使用了 ES 模块、`fetch` 与 WebGL，**必须通过本地服务器访问**（直接双击 `index.html` 以 `file://` 打开无法工作）。

```bash
# 方式一：Python（推荐，零依赖）
python serve.py            # 打开 http://127.0.0.1:8000
python serve.py 8080       # 指定端口

# 方式二：Windows 双击
start.bat
```

浏览器会自动打开。推荐 **Chrome / Edge 最新版**。

---

## 📂 目录结构

```
live2d web viewer/
├── index.html              # 页面骨架
├── styles/main.css         # 液态玻璃样式
├── src/
│   ├── main.js             # 启动与总装配线
│   ├── scene.js            # three.js 背景 + 天气粒子
│   ├── viewer.js           # PixiJS + Live2D 模型控制
│   ├── importer.js         # 文件夹 / 多文件 / .lpk 导入
│   ├── lpk.js              # 浏览器端 .lpk 解密（genkey + LCG XOR）
│   ├── filters.js          # CSS 滤镜
│   ├── audio.js            # 本地音乐 + 口型同步 + 频谱
│   ├── presets.js          # 模型 / 背景 / 滤镜预设数据
│   ├── ui.js               # 面板拖拽 / Dock / Toast / 布局持久化
│   └── logger.js           # 控制台日志系统
├── vendor/                 # 本地依赖（离线可用）
│   ├── three.min.js                  (r137, 全局 THREE)
│   ├── pixi.min.js                   (v7.4.3)
│   ├── pixi-live2d-display.min.js    (Cubism 2 + 4)
│   ├── live2dcubismcore.min.js
│   ├── live2d.min.js                 (Cubism 2 core)
│   └── jszip.min.js
├── serve.py / start.bat    # 本地静态服务器
└── tools/                  # 验证脚本（见下）
```

> 仓库不内置任何 Live2D 模型，启动后请自行导入（文件夹 / 多文件 / `.lpk`）。

---

## 📦 关于格式与导入

- **文件夹模型**：包含 `*.model3.json` / `model.json`（也兼容 `model0.json` 等命名）及其贴图、physics、表情等。拖入或用「模型文件夹」选择即可，资源通过 blob URL 在内存中加载。
- **`.lpk` 加密包**（Live2DViewerEX / Steam 创意工坊）：点击「🔓 .lpk 加密包」会**依次弹出两个窗口** —— 先选 `.lpk`，再选配套 `config.json`（Steam 包解密需要其中的 `fileId` 与 `metaData`；非加密包可在第二步取消跳过）。也支持把两者一起拖入。解密全程在浏览器本地完成。
- **导入历史**：每次成功导入都会记入「模型 / 导入」面板的历史列表。本会话内点击即可秒切；刷新后历史仍在，点击会提示重新选择对应文件（浏览器安全限制无法跨会话自动重读本地文件）。

> `.lpk` 解密算法移植自 [LpkUnpacker](LpkUnpacker/)，曾通过 `tools/test_lpk.cjs` 验证与 Python 解包结果**逐字节一致**。

---

## 🧪 验证

本项目自带无依赖验证脚本（需要 Node.js）：

```bash
node tools/smoke.cjs        # 无头 Chrome 加载页面，检查渲染与运行时错误（零异常）
```

`smoke.cjs` 通过 DevTools 协议在真实 WebGL 环境中加载并截获控制台错误。`tools/` 下另有 `test_lpk.cjs`（曾用于校验 `.lpk` 解密逐字节一致）与 `smoke2.cjs`（交互回归）；这两个脚本依赖已移除的示例模型，仅作开发期参考保留。

---

## 🛠️ 技术栈

three.js（背景与粒子）· PixiJS v7 + pixi-live2d-display（Live2D 渲染）· Live2D Cubism Core（2/4）· Web Audio API（口型同步）· 纯原生 ES 模块，无打包步骤。

## 🙏 致谢

Live2D 运行库与 `.lpk` 解密算法参考自仓库内的 **LpkUnpacker** 项目。模型版权归各自作者所有，仅供学习与展示。
