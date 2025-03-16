/**
 * thread_binding_linux.cpp
 * 
 * Linux实现的线程亲和性绑定模块
 * 使用sched_setaffinity系统调用实现CPU亲和性
 */

#include <napi.h>
#include <pthread.h>
#include <sched.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/sysinfo.h>
#include <sys/syscall.h>
#include <string.h>
#include <errno.h>
#include <fstream>
#include <string>
#include <vector>
#include <map>

// 获取当前线程ID
Napi::Number GetThreadId(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // 使用系统调用获取线程ID
    pid_t tid = syscall(SYS_gettid);
    return Napi::Number::New(env, static_cast<int>(tid));
}

// 将当前线程绑定到指定CPU核心
Napi::Boolean BindThreadToCore(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // 参数检查
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    int coreId = info[0].As<Napi::Number>().Int32Value();
    
    // 创建CPU掩码
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(coreId, &cpuset);
    
    // 将当前线程绑定到指定CPU核心
    int result = pthread_setaffinity_np(pthread_self(), sizeof(cpu_set_t), &cpuset);
    
    return Napi::Boolean::New(env, result == 0);
}

// 获取当前线程绑定的CPU核心
Napi::Number GetCurrentThreadCore(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // 创建CPU掩码
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    
    // 获取当前线程的CPU亲和性
    int result = pthread_getaffinity_np(pthread_self(), sizeof(cpu_set_t), &cpuset);
    
    if (result != 0) {
        return Napi::Number::New(env, -1);
    }
    
    // 查找设置了哪个核心
    for (int i = 0; i < CPU_SETSIZE; i++) {
        if (CPU_ISSET(i, &cpuset)) {
            return Napi::Number::New(env, i);
        }
    }
    
    // 未找到绑定的核心
    return Napi::Number::New(env, -1);
}

// 设置线程优先级
Napi::Boolean SetThreadPriority(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // 参数检查
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    int priority = info[0].As<Napi::Number>().Int32Value();
    
    // 将0-99的范围映射到POSIX线程优先级
    struct sched_param param;
    
    // 优先级范围和策略取决于系统
    // 这里使用SCHED_OTHER作为默认策略
    int policy = SCHED_OTHER;
    int minPrio = sched_get_priority_min(policy);
    int maxPrio = sched_get_priority_max(policy);
    
    // 映射优先级
    if (priority < 0) priority = 0;
    if (priority > 99) priority = 99;
    
    // 计算归一化优先级
    param.sched_priority = minPrio + ((priority * (maxPrio - minPrio)) / 99);
    
    // 设置线程优先级
    int result = pthread_setschedparam(pthread_self(), policy, &param);
    
    return Napi::Boolean::New(env, result == 0);
}

// 获取系统拓扑信息
Napi::Object GetSystemTopology(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    
    // 默认值
    int numaNodes = 1;
    std::vector<int> coresPerNode;
    std::map<int, int> logicalToPhysicalMap;
    
    // 尝试从Linux系统获取NUMA信息
    try {
        // 检查是否有NUMA节点
        std::ifstream nodesFile("/sys/devices/system/node/online");
        if (nodesFile.is_open()) {
            std::string line;
            std::getline(nodesFile, line);
            // 解析格式如"0-1"表示有节点0和1
            if (line.find('-') != std::string::npos) {
                numaNodes = std::stoi(line.substr(line.find('-') + 1)) + 1;
            } else if (!line.empty()) {
                numaNodes = std::stoi(line) + 1;
            }
            nodesFile.close();
        }
        
        // 计算每个节点的核心数量
        coresPerNode.resize(numaNodes, 0);
        
        for (int node = 0; node < numaNodes; node++) {
            std::string cpulistPath = "/sys/devices/system/node/node" + std::to_string(node) + "/cpulist";
            std::ifstream cpulistFile(cpulistPath);
            if (cpulistFile.is_open()) {
                std::string line;
                std::getline(cpulistFile, line);
                // 解析格式如"0-3,8-11"
                int count = 0;
                size_t pos = 0;
                while (pos < line.length()) {
                    size_t commaPos = line.find(',', pos);
                    if (commaPos == std::string::npos) commaPos = line.length();
                    
                    std::string range = line.substr(pos, commaPos - pos);
                    size_t dashPos = range.find('-');
                    
                    if (dashPos != std::string::npos) {
                        int start = std::stoi(range.substr(0, dashPos));
                        int end = std::stoi(range.substr(dashPos + 1));
                        count += (end - start + 1);
                        
                        // 构建映射
                        for (int cpu = start; cpu <= end; cpu++) {
                            logicalToPhysicalMap[cpu] = node;
                        }
                    } else if (!range.empty()) {
                        count++;
                        // 单个CPU
                        logicalToPhysicalMap[std::stoi(range)] = node;
                    }
                    
                    pos = commaPos + 1;
                }
                
                coresPerNode[node] = count;
                cpulistFile.close();
            }
        }
    } catch (const std::exception&) {
        // 如果出现任何异常，使用默认值
        numaNodes = 1;
        coresPerNode.clear();
        coresPerNode.push_back(get_nprocs());
        logicalToPhysicalMap.clear();
    }
    
    // 如果没有成功解析核心数，使用默认值
    if (coresPerNode.empty() || (coresPerNode.size() == 1 && coresPerNode[0] == 0)) {
        coresPerNode.clear();
        coresPerNode.push_back(get_nprocs());
    }
    
    // 构建结果对象
    result.Set("numaNodes", numaNodes);
    
    // 创建每个节点的核心数数组
    Napi::Array coresArray = Napi::Array::New(env, coresPerNode.size());
    for (size_t i = 0; i < coresPerNode.size(); i++) {
        coresArray[i] = coresPerNode[i];
    }
    result.Set("coresPerNode", coresArray);
    
    // 创建逻辑到物理核心映射
    Napi::Object mapObj = Napi::Object::New(env);
    for (const auto& pair : logicalToPhysicalMap) {
        mapObj.Set(std::to_string(pair.first), pair.second);
    }
    result.Set("logicalToPhysicalMap", mapObj);
    
    return result;
}

// 获取CPU使用率
Napi::Number GetCpuUsage(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // 默认返回所有核心的平均使用率
    int coreId = -1;
    
    // 检查是否指定了核心ID
    if (info.Length() >= 1 && info[0].IsNumber()) {
        coreId = info[0].As<Napi::Number>().Int32Value();
    }
    
    // 尝试读取 /proc/stat 获取CPU使用率
    try {
        std::ifstream statFile("/proc/stat");
        if (!statFile.is_open()) {
            return Napi::Number::New(env, 0.0);
        }
        
        std::string line;
        int currentCore = -1;
        
        // 查找指定的核心或所有核心
        while (std::getline(statFile, line)) {
            if (line.compare(0, 3, "cpu") == 0) {
                if (line[3] >= '0' && line[3] <= '9') {
                    // 这是某个特定的核心 (cpu0, cpu1, ...)
                    currentCore = std::stoi(line.substr(3));
                    
                    // 如果指定了核心ID并且这是我们要找的，或者我们要计算所有核心
                    if (coreId == -1 || currentCore == coreId) {
                        // 解析CPU时间
                        size_t pos = line.find(' ');
                        pos = line.find_first_not_of(' ', pos);
                        
                        // 格式: cpuN user nice system idle iowait irq softirq steal guest guest_nice
                        unsigned long user, nice, system, idle, iowait, irq, softirq, steal;
                        sscanf(line.c_str() + pos, "%lu %lu %lu %lu %lu %lu %lu %lu", 
                               &user, &nice, &system, &idle, &iowait, &irq, &softirq, &steal);
                        
                        unsigned long totalIdle = idle + iowait;
                        unsigned long totalNonIdle = user + nice + system + irq + softirq + steal;
                        unsigned long total = totalIdle + totalNonIdle;
                        
                        // 简单计算使用率
                        double usagePercent = 100.0 * (double)totalNonIdle / (double)total;
                        
                        // 如果我们找到了指定的核心，立即返回
                        if (coreId != -1 && currentCore == coreId) {
                            return Napi::Number::New(env, usagePercent);
                        }
                        
                        // 如果我们要计算所有核心，这里处理第一个，然后会继续
                        if (coreId == -1) {
                            return Napi::Number::New(env, usagePercent);
                        }
                    }
                }
            }
        }
        
        // 如果没有找到指定的核心
        if (coreId != -1) {
            return Napi::Number::New(env, 0.0);
        }
    } catch (const std::exception&) {
        // 出错时返回0
        return Napi::Number::New(env, 0.0);
    }
    
    // 默认返回0
    return Napi::Number::New(env, 0.0);
}

// 设置NUMA亲和性
Napi::Boolean SetNumaAffinity(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // 参数检查
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    int numaNode = info[0].As<Napi::Number>().Int32Value();
    
#ifdef _GNU_SOURCE
    // 尝试设置NUMA亲和性
    // 注意：这需要libnuma支持
    // 这里我们使用一个简单的实现，实际应用可能需要链接libnuma
    
    // 检查NUMA节点是否存在
    std::string nodePath = "/sys/devices/system/node/node" + std::to_string(numaNode);
    if (access(nodePath.c_str(), F_OK) == -1) {
        return Napi::Boolean::New(env, false);
    }
    
    try {
        // 读取此NUMA节点的CPU列表
        std::string cpulistPath = nodePath + "/cpulist";
        std::ifstream cpulistFile(cpulistPath);
        if (!cpulistFile.is_open()) {
            return Napi::Boolean::New(env, false);
        }
        
        std::string line;
        std::getline(cpulistFile, line);
        cpulistFile.close();
        
        // 创建CPU掩码
        cpu_set_t cpuset;
        CPU_ZERO(&cpuset);
        
        // 解析格式如"0-3,8-11"
        size_t pos = 0;
        while (pos < line.length()) {
            size_t commaPos = line.find(',', pos);
            if (commaPos == std::string::npos) commaPos = line.length();
            
            std::string range = line.substr(pos, commaPos - pos);
            size_t dashPos = range.find('-');
            
            if (dashPos != std::string::npos) {
                int start = std::stoi(range.substr(0, dashPos));
                int end = std::stoi(range.substr(dashPos + 1));
                
                // 设置范围内的所有CPU
                for (int cpu = start; cpu <= end; cpu++) {
                    CPU_SET(cpu, &cpuset);
                }
            } else if (!range.empty()) {
                // 单个CPU
                CPU_SET(std::stoi(range), &cpuset);
            }
            
            pos = commaPos + 1;
        }
        
        // 应用CPU掩码
        int result = pthread_setaffinity_np(pthread_self(), sizeof(cpu_set_t), &cpuset);
        
        return Napi::Boolean::New(env, result == 0);
    } catch (const std::exception&) {
        return Napi::Boolean::New(env, false);
    }
#else
    // 不支持NUMA或GNU扩展
    return Napi::Boolean::New(env, false);
#endif
}

// 解除线程绑定
Napi::Boolean UnbindThread(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // 创建CPU掩码，包括所有可用核心
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    
    // 获取可用CPU数量
    int numCPUs = get_nprocs();
    
    // 设置所有可用CPU
    for (int i = 0; i < numCPUs; i++) {
        CPU_SET(i, &cpuset);
    }
    
    // 应用CPU掩码，允许线程在任何核心上运行
    int result = pthread_setaffinity_np(pthread_self(), sizeof(cpu_set_t), &cpuset);
    
    return Napi::Boolean::New(env, result == 0);
}

// 初始化模块
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getThreadId", Napi::Function::New(env, GetThreadId));
    exports.Set("bindThreadToCore", Napi::Function::New(env, BindThreadToCore));
    exports.Set("getCurrentThreadCore", Napi::Function::New(env, GetCurrentThreadCore));
    exports.Set("setThreadPriority", Napi::Function::New(env, SetThreadPriority));
    exports.Set("getSystemTopology", Napi::Function::New(env, GetSystemTopology));
    exports.Set("getCpuUsage", Napi::Function::New(env, GetCpuUsage));
    exports.Set("setNumaAffinity", Napi::Function::New(env, SetNumaAffinity));
    exports.Set("unbindThread", Napi::Function::New(env, UnbindThread));
    
    return exports;
}

NODE_API_MODULE(thread_binding_linux, Init) 