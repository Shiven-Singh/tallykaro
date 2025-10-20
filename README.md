# TallyKaro Desktop Connector

AWS AI Agent Global Hackathon Submission

AI-powered desktop application enabling natural language queries to Tally ERP systems using AWS Bedrock and Claude 3.5 Sonnet v2.

## Overview

TallyKaro bridges the gap between traditional accounting software and modern AI capabilities. Small business owners can now interact with their Tally ERP data using natural language in their preferred language (English, Hindi, or mixed), powered by AWS Bedrock's Claude 3.5 Sonnet v2.

## Key Features

- **Natural Language Processing**: Query your Tally data in English, Hindi, or Hinglish
- **AWS Bedrock Integration**: Powered by Claude 3.5 Sonnet v2 for intelligent query understanding
- **Direct ODBC Connection**: Secure, direct access to Tally ERP databases
- **Multi-language Support**: Understands context in multiple languages
- **Real-time Query Processing**: Instant responses to business questions
- **PDF Report Generation**: Professional ledger and account reports
- **Smart Data Display**: Sortable columns, pagination, and intelligent filtering

## Demo Mode

For evaluation without Tally ERP installation, TallyKaro includes a comprehensive demo mode with realistic business data. See [demoCredentials.md](demoCredentials.md) for details on demo features and sample queries.

## Architecture

TallyKaro uses a three-tier architecture:
1. **Frontend**: Next.js React application with responsive UI
2. **Desktop Layer**: Electron for secure local ODBC connectivity
3. **AI Layer**: AWS Bedrock (Claude 3.5 Sonnet v2) for natural language understanding

For detailed architecture and implementation information, see [setupGuide.md](setupGuide.md).

## Example Queries

**English**
- "What is my closing balance?"
- "Show me sales report"
- "Generate ledger for Ramesh & Co"

**Hindi**
- "sabse zyada balance kiska hai?"
- "stock kitna hai?"
- "sales report chahiye"

**Mixed (Hinglish)**
- "July ka sales kitna tha?"
- "Outstanding amount show karo"
- "Top 5 customers ka balance dikhao"

## Technical Highlights

- **AWS Bedrock Integration**: Bearer token authentication with Claude 3.5 Sonnet v2
- **Secure ODBC**: Direct database connectivity without data exposure
- **Context Management**: Maintains conversation context for follow-up queries
- **Multi-language NLP**: Language detection and context-aware responses
- **Query Optimization**: Intelligent SQL generation for complex business queries

## Requirements

- Windows 10/11 (64-bit)
- AWS Bedrock access with Claude 3.5 Sonnet v2
- Tally ERP with ODBC enabled (or use demo mode)

## Configuration

Environment variables required:
- `AWS_BEARER_TOKEN_BEDROCK`: AWS Bedrock authentication token
- `AWS_REGION`: AWS region (default: ap-south-1)

Optional for full functionality:
- S3 for data caching
- Supabase for cloud sync

---

**Hackathon**: AWS AI Agent Global Hackathon
**Version**: 0.1.0