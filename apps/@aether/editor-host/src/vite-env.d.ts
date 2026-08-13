// @aether/editor-host · Vite 环境类型声明。
// 声明 CSS 副作用导入与静态资源模块，供 tsc 识别 Vite 特有模块。
declare module '*.css' {
  const content: string
  export default content
}
