# LightPrep · 浏览器内演唱会灯光预演工具

纯 **TypeScript + 原生 WebGL2** 实现，不依赖任何 3D 引擎。在浏览器里完成场馆搭建、布灯、调光与 Cue 时间线预演，数据保存在本机，可导出工程文件发给同事。

## 运行

```bash
npm install
npm run dev        # 开发服务器（自动开浏览器）
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 预览生产构建
```

冒烟测试（无头 Chromium，验证四个页面、WebGL2、FPS、持久化、颜色混合）：

```bash
npm run build
node scripts/smoke.mjs          # 默认 1920×1080，截图输出到 scripts/shots/
node scripts/diag.mjs           # 光斑落点/像素诊断
```

## 功能与对应实现

| 需求 | 实现 |
| --- | --- |
| 场馆新建/复制/删除、自动存浏览器、导入导出 | `src/lib/store.ts`：localStorage 防抖自动保存 + 自包含 JSON 工程（`ExportFile`），导入时重映射全部 id |
| 桁架/台阶拖拽摆放、网格吸附 | `src/pages/stage.ts` + `renderer.pick/pickGround`：射线拾取 + 地面投影，0.5m 网格吸附 |
| 摇头光束/染色两种灯具，光束角/颜色/亮度可配 | `src/types.ts` 模板模型 + `src/pages/library.ts`，实例可覆盖模板参数 |
| 体积光束、烟雾浓度、地面/布景光斑 | `render/shaders.ts`：Fresnel 圆锥光束 + 径向衰减光斑，烟雾浓度驱动光束 alpha，光束与地面/布景/台阶求交 |
| 多灯叠色不爆白 | RGBA16F 浮点 HDR 帧缓冲，全程线性加色混合，后处理 ACES 色调映射（`POST_FS`）收敛高光 |
| Cue 时间线、渐变时长、播放/暂停 | `src/lib/cuePlayer.ts`：rAF 时间戳驱动，每 Cue 存整组灯具状态 |
| 摇头灯平滑不抖 | `easeInOutCubic` 缓动 + `lerpAngle` 角度最短路径插值，逐帧连续输出 |
| 12 灯测试场馆、30fps、显示帧率 | `createSeedVenue()` 自带 12 灯+桁架+台阶+4 个 Cue；`Viewer` 每 0.5s 统计并显示 FPS |

## 架构

```
src/
  types.ts            领域模型（场馆/灯具/桁架/台阶/Cue/导出格式）
  app.ts              hash 路由 + 全局状态 + 自动保存
  lib/
    store.ts          持久化、导入导出、12 灯种子场馆
    cuePlayer.ts      Cue 播放状态机（缓动 + 最短角度插值）
    state.ts          模板/实例/Cue 状态解析
    color.ts          sRGB->线性、id 工具
    dom.ts            零框架 DOM 辅助
  render/
    gl.ts             WebGL2 薄封装（program/VAO/HDR 探测）
    math3d.ts         向量矩阵、射线求交
    geometry.ts       程序化几何（立方体/圆锥/圆柱/桁架线框…）
    shaders.ts        全部 GLSL ES 3.00
    camera.ts         轨道相机 + 拾取射线
    renderer.ts       HDR 管线：不透明场景 -> 透明光束/光斑 -> ACES 后处理
    viewer.ts         渲染循环、FPS、相机交互、拖拽
  pages/              场馆列表 / 舞台编辑 / 灯具库 / Cue 编排
```

### 渲染管线要点

1. 场景先画进 **RGBA16F 浮点帧缓冲**（不支持浮点的设备自动回退 RGBA8）。
2. 不透明物体（地面、布景、台阶、灯壳）用固定三点布光的 Lambert 着色。
3. 光束与光斑用 `SRC_ALPHA, ONE` **加色混合**，在线性空间累加——多灯重叠是波长各自增强，而非直接钳到白。
4. 最后一道全屏后处理做曝光 + **ACES filmic** 色调映射 + 线性转 sRGB，高亮被平滑压缩，保留色相。

## 操作

- 左键拖拽：旋转视角；点中物体后拖拽 = 在地面移动（自动吸附）
- 右键 / Shift+拖拽：平移；滚轮：缩放
- 所有编辑即时自动保存，右上角可随时导出 `.lightprep.json`
