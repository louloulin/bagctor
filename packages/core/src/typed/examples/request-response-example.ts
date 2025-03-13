/**
 * 请求-响应模式示例
 * 
 * 这个示例展示了如何使用Bagctor的请求-响应模式
 * 创建一个简单的计算服务，它可以执行加法、减法和乘法操作
 */

import {
    RequestResponseProtocol,
    createRequestResponseMap,
    generateCorrelationId,
    RequestResponseManager
} from '../index';

// 定义请求和响应类型
interface AddRequest { a: number; b: number; }
interface AddResponse { result: number; }

interface SubtractRequest { a: number; b: number; }
interface SubtractResponse { result: number; }

interface MultiplyRequest { a: number; b: number; }
interface MultiplyResponse { result: number; }

// 定义请求-响应协议
const AddProtocol: RequestResponseProtocol<AddRequest, AddResponse> = createRequestResponseMap(
    'add',
    'addResult',
    (value: any): value is AddRequest => {
        return typeof value === 'object' &&
            value !== null &&
            typeof value.a === 'number' &&
            typeof value.b === 'number';
    },
    (value: any): value is AddResponse => {
        return typeof value === 'object' &&
            value !== null &&
            typeof value.result === 'number';
    }
);

const SubtractProtocol: RequestResponseProtocol<SubtractRequest, SubtractResponse> = createRequestResponseMap(
    'subtract',
    'subtractResult'
);

const MultiplyProtocol: RequestResponseProtocol<MultiplyRequest, MultiplyResponse> = createRequestResponseMap(
    'multiply',
    'multiplyResult'
);

// 计算服务实现
class CalculatorService {
    // 处理加法请求
    handleAddRequest(request: AddRequest): AddResponse {
        return { result: request.a + request.b };
    }

    // 处理减法请求
    handleSubtractRequest(request: SubtractRequest): SubtractResponse {
        return { result: request.a - request.b };
    }

    // 处理乘法请求
    handleMultiplyRequest(request: MultiplyRequest): MultiplyResponse {
        return { result: request.a * request.b };
    }
}

// 模拟请求-响应交互
async function simulateRequestResponse() {
    // 创建请求-响应管理器
    const requestManager = new RequestResponseManager();

    // 创建计算服务
    const calculator = new CalculatorService();

    // 模拟发送加法请求
    const addRequest = { a: 5, b: 3 };
    const addCorrelationId = generateCorrelationId();

    console.log(`Sending add request: ${addRequest.a} + ${addRequest.b}`);

    // 注册请求并获取Promise
    const addResponsePromise = requestManager.registerRequest<AddResponse>(addCorrelationId);

    // 模拟服务处理请求
    setTimeout(() => {
        // 计算结果
        const addResponse = calculator.handleAddRequest(addRequest);

        // 创建响应消息
        const responseMessage = {
            type: AddProtocol.responseType,
            payload: addResponse,
            metadata: {
                correlationId: addCorrelationId,
                isResponse: true,
                timestamp: Date.now()
            }
        };

        // 处理响应
        requestManager.handleResponse(responseMessage);
    }, 500);

    // 等待响应
    try {
        const result = await addResponsePromise;
        console.log(`Received add response: ${result.result}`);
    } catch (error) {
        console.error('Add request failed:', error);
    }

    // 模拟发送乘法请求
    const multiplyRequest = { a: 4, b: 7 };
    const multiplyCorrelationId = generateCorrelationId();

    console.log(`Sending multiply request: ${multiplyRequest.a} * ${multiplyRequest.b}`);

    // 注册请求并获取Promise
    const multiplyResponsePromise = requestManager.registerRequest<MultiplyResponse>(multiplyCorrelationId);

    // 模拟服务处理请求
    setTimeout(() => {
        // 计算结果
        const multiplyResponse = calculator.handleMultiplyRequest(multiplyRequest);

        // 创建响应消息
        const responseMessage = {
            type: MultiplyProtocol.responseType,
            payload: multiplyResponse,
            metadata: {
                correlationId: multiplyCorrelationId,
                isResponse: true,
                timestamp: Date.now()
            }
        };

        // 处理响应
        requestManager.handleResponse(responseMessage);
    }, 800);

    // 等待响应
    try {
        const result = await multiplyResponsePromise;
        console.log(`Received multiply response: ${result.result}`);
    } catch (error) {
        console.error('Multiply request failed:', error);
    }
}

// 运行示例
simulateRequestResponse().catch(console.error); 