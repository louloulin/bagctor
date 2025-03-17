import { HttpToolActor } from './httpTool';
import { FileToolActor } from './fileTool';

/**
 * 工具名称常量
 */
export const TOOL_NAMES = {
    HTTP: 'http',
    FILE: 'file'
};

export {
    // HTTP 工具
    HttpToolActor,

    // 文件工具
    FileToolActor
}; 