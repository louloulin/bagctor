import { Actor, Message } from '@bactor/core';
import { PID } from '@bactor/common';
import type { ActorContext } from '@bactor/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * 文件操作参数
 */
export interface FileOperationParams {
    path: string;
    content?: string;
    encoding?: BufferEncoding;
}

/**
 * 读取文件消息
 */
export interface ReadFileMessage extends Message {
    type: 'read_file';
    params: FileOperationParams;
}

/**
 * 写入文件消息
 */
export interface WriteFileMessage extends Message {
    type: 'write_file';
    params: FileOperationParams;
}

/**
 * 列出目录消息
 */
export interface ListDirectoryMessage extends Message {
    type: 'list_directory';
    params: FileOperationParams;
}

/**
 * 文件操作响应消息
 */
export interface FileResponseMessage extends Message {
    type: 'file_response';
    result: any;
}

/**
 * 文件操作错误消息
 */
export interface FileErrorMessage extends Message {
    type: 'file_error';
    error: string;
}

export type FileToolMessage = ReadFileMessage | WriteFileMessage | ListDirectoryMessage;
export type FileResponseType = FileResponseMessage | FileErrorMessage;

/**
 * 文件工具Actor，提供文件操作能力
 * 支持读取、写入文件和列出目录内容
 */
export class FileToolActor extends Actor<{}, Message> {
    constructor(context: ActorContext) {
        super(context, {});
    }

    /**
     * 定义Actor的行为
     */
    protected behaviors(): void {
        this.addBehavior('default', this.handleFileOperation.bind(this));
    }

    /**
     * 处理文件操作请求
     */
    private async handleFileOperation(message: Message): Promise<void> {
        try {
            if (message.type === 'read_file') {
                await this.handleReadFile(message as ReadFileMessage);
            } else if (message.type === 'write_file') {
                await this.handleWriteFile(message as WriteFileMessage);
            } else if (message.type === 'list_directory') {
                await this.handleListDirectory(message as ListDirectoryMessage);
            }
        } catch (error: any) {
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'file_error',
                    error: error?.message || String(error)
                } as FileErrorMessage);
            }
        }
    }

    /**
     * 处理读取文件请求
     */
    private async handleReadFile(message: ReadFileMessage): Promise<void> {
        const { path: filePath, encoding = 'utf-8' } = message.params;

        try {
            const content = await fs.readFile(filePath, { encoding });

            if (message.sender) {
                await this.send(message.sender, {
                    type: 'file_response',
                    result: {
                        content,
                        path: filePath
                    }
                } as FileResponseMessage);
            }
        } catch (error: any) {
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'file_error',
                    error: `Failed to read file '${filePath}': ${error.message}`
                } as FileErrorMessage);
            }
        }
    }

    /**
     * 处理写入文件请求
     */
    private async handleWriteFile(message: WriteFileMessage): Promise<void> {
        const { path: filePath, content = '', encoding = 'utf-8' } = message.params;

        try {
            // 确保目录存在
            await this.ensureDirectoryExists(path.dirname(filePath));

            // 写入文件
            await fs.writeFile(filePath, content, { encoding });

            if (message.sender) {
                await this.send(message.sender, {
                    type: 'file_response',
                    result: {
                        success: true,
                        path: filePath
                    }
                } as FileResponseMessage);
            }
        } catch (error: any) {
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'file_error',
                    error: `Failed to write file '${filePath}': ${error.message}`
                } as FileErrorMessage);
            }
        }
    }

    /**
     * 处理列出目录请求
     */
    private async handleListDirectory(message: ListDirectoryMessage): Promise<void> {
        const { path: dirPath } = message.params;

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
            const directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

            if (message.sender) {
                await this.send(message.sender, {
                    type: 'file_response',
                    result: {
                        path: dirPath,
                        files,
                        directories
                    }
                } as FileResponseMessage);
            }
        } catch (error: any) {
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'file_error',
                    error: `Failed to list directory '${dirPath}': ${error.message}`
                } as FileErrorMessage);
            }
        }
    }

    /**
     * 确保目录存在，如果不存在则创建
     */
    private async ensureDirectoryExists(directoryPath: string): Promise<void> {
        try {
            await fs.access(directoryPath);
        } catch (error) {
            // 目录不存在，创建它
            await fs.mkdir(directoryPath, { recursive: true });
        }
    }
} 