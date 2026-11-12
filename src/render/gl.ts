// WebGL2 薄封装：shader 编译、VAO、uniform 等

export function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: true,
    premultipliedAlpha: false
  });
  if (!gl) throw new Error('当前浏览器不支持 WebGL2，请使用最新版 Chrome / Edge / Firefox');
  return gl;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader 编译失败: ' + log + '\n' + src);
  }
  return sh;
}

export interface Program {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
  uniformNames: string[]
): Program {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('Program 链接失败: ' + gl.getProgramInfoLog(p));
  }
  const uniforms: Record<string, WebGLUniformLocation> = {};
  for (const n of uniformNames) {
    const loc = gl.getUniformLocation(p, n);
    if (loc) uniforms[n] = loc;
  }
  return { gl, program: p, uniforms };
}

export function useProgram(p: Program): void {
  p.gl.useProgram(p.program);
}

export interface VBO {
  vao: WebGLVertexArrayObject;
  count: number;
  mode: number;
}

/** 由交错顶点数据建 VAO，attributes 描述 [location, 分量数] */
export function createVBO(
  gl: WebGL2RenderingContext,
  data: Float32Array,
  layout: Array<[number, number]>,
  mode: number
): VBO {
  const vao = gl.createVertexArray()!;
  const buf = gl.createBuffer()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const stride = layout.reduce((s, [, n]) => s + n, 0) * 4;
  let offset = 0;
  for (const [loc, n] of layout) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, offset);
    offset += n * 4;
  }
  gl.bindVertexArray(null);
  const perVertex = layout.reduce((s, [, n]) => s + n, 0);
  return { vao, count: data.length / perVertex, mode };
}

export function drawVBO(gl: WebGL2RenderingContext, v: VBO): void {
  gl.bindVertexArray(v.vao);
  gl.drawArrays(v.mode, 0, v.count);
}

/** 检测浮点颜色缓冲是否可用（HDR 管线需要） */
export function supportsHDR(gl: WebGL2RenderingContext): boolean {
  const ext = gl.getExtension('EXT_color_buffer_float');
  return !!ext;
}
