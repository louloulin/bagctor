// 基本的 Bun 类型声明
declare var Bun: {
    version: string;
    // 添加更多 Bun 相关的类型定义
};

// 解决文档类型引用问题
declare module 'docs' {
    const content: any;
    export default content;
} 