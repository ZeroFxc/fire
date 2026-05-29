/**
 * Cloudflare Workers - 支付回调接收器
 * 用于接收支付宝扫码对账后的支付数据
 */

/**
 * 生成唯一ID
 */
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 验证请求是否有效
 */
function validateRequest(request) {
    if (request.method !== 'POST') {
        return { valid: false, error: '只接受POST请求' };
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        return { valid: false, error: 'Content-Type必须是application/json' };
    }

    return { valid: true };
}

/**
 * 处理支付数据
 */
async function handlePaymentData(data, env) {
    const paymentRecord = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        data: data,
        status: 'received'
    };

    // 如果配置了KV，保存数据
    if (env && env.Pay) {
        const key = `payment_${paymentRecord.id}`;
        await env.Pay.put(key, JSON.stringify(paymentRecord));
        console.log(`数据已保存到KV: ${key}`);

        // 同时更新索引，方便查询最新记录
        const indexKey = 'payment_index';
        let indexData = await env.Pay.get(indexKey, 'json') || [];
        indexData.unshift({
            id: paymentRecord.id,
            timestamp: paymentRecord.timestamp,
            tradeNo: data.tradeNo || '',
            amount: data.actualAmount || ''
        });
        // 只保留最近100条记录
        indexData = indexData.slice(0, 100);
        await env.Pay.put(indexKey, JSON.stringify(indexData));
    }

    return paymentRecord;
}

/**
 * 主处理函数
 */
async function handleRequest(request, env) {
    const validation = validateRequest(request);

    if (!validation.valid) {
        return new Response(JSON.stringify({
            success: false,
            error: validation.error
        }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }

    try {
        const paymentData = await request.json();

        console.log('收到支付数据:', JSON.stringify(paymentData, null, 2));

        const result = await handlePaymentData(paymentData, env);

        return new Response(JSON.stringify({
            success: true,
            message: '数据接收成功',
            record: result
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error) {
        console.error('处理失败:', error);

        return new Response(JSON.stringify({
            success: false,
            error: '数据处理失败',
            details: error.message
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}

/**
 * 处理CORS预检请求
 */
async function handleOptions(request, env) {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}

/**
 * 入口点
 */
addEventListener('fetch', event => {
    const { request } = event;

    if (request.method === 'OPTIONS') {
        event.respondWith(handleOptions(request, event.env));
    } else {
        event.respondWith(handleRequest(request, event.env));
    }
});
