/**
 * 提供编码和解码功能用于libp2p通信
 */

/**
 * 文本编码器
 */
export const encoder = new TextEncoder();

/**
 * 文本解码器
 */
export const decoder = new TextDecoder();

/**
 * 编码对象为二进制数据
 * @param obj 要编码的对象
 * @returns 编码后的二进制数据
 */
export function encodeObject(obj: any): Uint8Array {
    return encoder.encode(JSON.stringify(obj));
}

/**
 * 解码二进制数据为对象
 * @param data 要解码的二进制数据
 * @returns 解码后的对象
 */
export function decodeObject(data: Uint8Array): any {
    const jsonString = decoder.decode(data);
    return JSON.parse(jsonString);
}

/**
 * 编码对象用于传输
 * @param obj 要编码的对象
 * @returns 编码后的字符串
 */
export function encodeForTransport(obj: any): string {
    return JSON.stringify(obj);
}

/**
 * 解码传输中的对象
 * @param data 要解码的字符串
 * @returns 解码后的对象
 */
export function decodeFromTransport(data: string): any {
    return JSON.parse(data);
} 