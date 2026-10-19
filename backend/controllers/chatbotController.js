const { UserWarranty, Merchant } = require('../models/schema')
require('dotenv').config({ override: true })

const WEBSITE_KNOWLEDGE = `
You are the Warranty Storage AI Assistant. You help users navigate and use the Warranty Storage platform.

ABOUT THE PLATFORM:
Warranty Storage is a secure, cloud-based platform to store and manage product warranties. Users can upload warranty documents, track expiry dates, and get merchant verification — all in one place.

FOR CLIENTS (Regular Users):
- Register a new account at the Register User page
- Login at the Login page with your email and password
- After login, you are taken to the Warranty Dashboard where all your warranties are displayed in a table
- Click the "Add New Warranty" button to upload a new warranty. You need: product name, purchase date, store name, store location, and an invoice image
- Every new warranty goes through merchant verification before it is confirmed. The status will show "Pending Verification" until the merchant approves or rejects it
- Possible warranty statuses: Pending Verification, Verified (validated), Expired, Cancelled (rejected)
- Use the filter bar above the table to filter warranties by store name, store location, or status
- To reset filters, click the reset icon in the filter bar

FOR MERCHANTS (Business Users):
- Register as a merchant at the Register Merchant page with your business name, contact name, work email, phone, business address, and business type
- Login at the Login page and check the "I am signing in as a Merchant" checkbox
- After login, you see the Merchant Validation dashboard showing all customer warranties submitted to your store
- Review each warranty: click "Verify" to approve or reject it
- When approving, enter the warranty duration in years and months
- When rejecting, provide a reason — the customer is automatically notified by email
- Use filters to sort by product name or status

GENERAL NAVIGATION:
- Home page: Overview of the platform and features
- About Us: Learn about the team behind Warranty Storage
- FAQs: Common questions and answers about the platform
- Contact Us: Submit a query or feedback to the support team
- Forgot Password: Reset your password using OTP sent to your email

IMPORTANT RULES:
- You must ONLY answer questions related to Warranty Storage and its features
- If someone asks about topics unrelated to this platform, politely redirect them
- Be concise, friendly, and helpful
- When referring to warranty data, only discuss the data provided in the context below
- Never make up or fabricate warranty information
- If no warranty data is provided in context, tell the user to log in first to see their warranty details
`

const chatHandler = async (req, res) => {
    const { message, email, isMerchant, storeName, storeLocation, history } = req.body

    if (!message) {
        return res.status(400).json({ error: 'Message is required' })
    }

    try {
        // Build system prompt based on auth state
        let systemPrompt = WEBSITE_KNOWLEDGE
        let warrantyContext = ''

        if (email && !isMerchant) {
            // Logged-in client — fetch their warranties
            const warranties = await UserWarranty.find({ email }).select('-invoice').lean()
            if (warranties.length > 0) {
                const warrantyData = warranties.map(w => ({
                    id: w._id,
                    product: w.product_name,
                    store: w.store_name,
                    location: w.store_location,
                    purchased: w.purchase_date,
                    expires: w.expiry_date || 'Not set',
                    status: w.status
                }))
                warrantyContext = `\n\nUSER WARRANTY DATA (for ${email}):\nThe user currently has ${warranties.length} warranty record(s):\n${JSON.stringify(warrantyData, null, 2)}\n\nUse this data to answer the user's questions about their warranties. If they ask about a specific product, find it in this list. If they ask about expiring warranties, check the expiry dates. Today's date is ${new Date().toISOString().split('T')[0]}.`
            } else {
                warrantyContext = `\n\nUSER WARRANTY DATA (for ${email}):\nThis user has no warranty records yet. Suggest they add a new warranty using the "Add New Warranty" button on their dashboard.`
            }
        } else if (email && isMerchant && storeName && storeLocation) {
            // Logged-in merchant — fetch their store's warranties
            const warranties = await UserWarranty.find({
                store_name: storeName,
                store_location: storeLocation
            }).select('-invoice').lean()

            if (warranties.length > 0) {
                const warrantyData = warranties.map(w => ({
                    id: w._id,
                    customerEmail: w.email,
                    product: w.product_name,
                    purchased: w.purchase_date,
                    expires: w.expiry_date || 'Not set',
                    status: w.status
                }))

                const pending = warranties.filter(w => w.status === 'Pending Verification').length
                const validated = warranties.filter(w => w.status === 'validated').length
                const rejected = warranties.filter(w => w.status === 'rejected').length

                warrantyContext = `\n\nMERCHANT STORE DATA (${storeName} at ${storeLocation}):\nTotal warranties: ${warranties.length} | Pending: ${pending} | Validated: ${validated} | Rejected: ${rejected}\n\nAll warranty records:\n${JSON.stringify(warrantyData, null, 2)}\n\nUse this data to answer the merchant's questions about their store's warranties. Today's date is ${new Date().toISOString().split('T')[0]}.`
            } else {
                warrantyContext = `\n\nMERCHANT STORE DATA (${storeName} at ${storeLocation}):\nNo warranty submissions for this store yet.`
            }
        } else {
            // Not logged in
            warrantyContext = `\n\nNOTE: The user is NOT logged in. You can only answer general questions about the Warranty Storage platform and how to use it. If they ask about specific warranty data, tell them to log in first. Guide them to the Login page.`
        }

        systemPrompt += warrantyContext

        // Build messages array for OpenAI
        const messages = [
            { role: 'system', content: systemPrompt }
        ]

        // Add conversation history if provided
        if (history && Array.isArray(history)) {
            history.forEach(msg => {
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content
                })
            })
        }

        // Add current message
        messages.push({ role: 'user', content: message })

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.flushHea        // Call OpenAI streaming API
        const https = require('https');
        const reqData = JSON.stringify({
            model: 'openai/gpt-oss-20b',
            messages: messages,
            stream: true,
            temperature: 0.7,
            max_tokens: 800
        });

        const reqOptions = {
            hostname: 'api.groq.com',
            port: 443,
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.Api_key}`,
                'Content-Length': Buffer.byteLength(reqData),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Connection': 'close'
            }
        };

        const groqReq = https.request(reqOptions, (groqRes) => {
            if (groqRes.statusCode !== 200) {
                if (!res.headersSent) res.write(`data: ${JSON.stringify({ error: 'AI service unavailable. Please try again later.' })}\n\n`);
                return res.end();
            }

            let buffer = '';
            groqRes.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep incomplete part

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed === '') continue;
                    if (trimmed === 'data: [DONE]') {
                        res.write('data: [DONE]\n\n');
                        continue;
                    }
                    if (trimmed.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            const content = json.choices?.[0]?.delta?.content;
                            if (content) {
                                res.write(`data: ${JSON.stringify({ content })}\n\n`);
                            }
                        } catch (e) {
                            // ignore malformed fast chunks
                        }
                    }
                }
            });

            groqRes.on('end', () => {
                res.write('data: [DONE]\n\n');
                res.end();
            });
        });

        groqReq.on('error', (error) => {
            console.error('Groq HTTPS Request error:', error);
            require('fs').appendFileSync('/tmp/chatbot_err.log', new Date().toISOString() + '\\n' + error.stack + '\\nCause: ' + (error.cause ? error.cause.message : 'none') + '\\n\\n');
            if (!res.headersSent) res.write(`data: ${JSON.stringify({ error: 'Something went wrong.' })}\n\n`);
            res.end();
        });

        groqReq.write(reqData);
        groqReq.end();

    } catch (error) {
        console.error('Chatbot error:', error)
        require('fs').appendFileSync('/tmp/chatbot_err.log', new Date().toISOString() + '\\n' + error.stack + '\\nCause: ' + (error.cause ? error.cause.message : 'none') + '\\nKey: ' + process.env.Api_key + '\\n\\n')
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' })
        } else {
            res.write(`data: ${JSON.stringify({ error: 'Something went wrong.' })}\n\n`)
            res.write('data: [DONE]\n\n')
            res.end()
        }
    }
}

module.exports = { chatHandler }
