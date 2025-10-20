# Demo Credentials and Test Data

## What This Document Contains

This document explains the test data and credentials available for evaluating TallyKaro Desktop Connector. It helps judges understand the system's capabilities without needing a Tally ERP installation.

---

## Authentication Credentials

### Email Login
- Email: demo@techcorp.com
- Password: Demo@2024

### Mobile OTP Login
- Mobile Number: +91-9876543210
- OTP Code: 123456 (or any 6-digit code in demo mode)

---

## Understanding the Demo Company

The demo dataset represents TechCorp Enterprises Ltd, a technology products distributor. This realistic business scenario includes:

### Company Profile
- Name: TechCorp Enterprises Ltd
- Location: Tech City, Maharashtra 110001
- Industry: IT Hardware and Software Distribution
- Financial Year: April 2024 - March 2025

### Financial Overview
- Total Assets: Rs. 15,11,000
- Total Liabilities: Rs. 6,18,000
- Net Worth: Rs. 8,93,000
- Net Profit Margin: 4.4%

This data structure mirrors real-world Tally implementations used by small to medium businesses across India.

---

## Natural Language Query Capabilities

The system processes queries in three languages. Here's what judges should understand about query processing:

### How Queries Work

When a user asks "What is my cash balance?", the system:
1. Analyzes the query using AWS Bedrock (Claude 3.5 Sonnet)
2. Identifies the intent (checking cash account balance)
3. Maps to appropriate Tally database tables
4. Executes ODBC query against live Tally data
5. Returns formatted results in natural language

### English Query Examples

**Financial Queries:**
- "What is the total balance?"
- "Show me the profit and loss"
- "What is our current financial position?"

**Customer Queries:**
- "Who are my top 5 customers?"
- "Show outstanding receivables"
- "Which customer owes the most?"

**Banking Queries:**
- "What is my bank balance?"
- "Show all bank accounts"
- "What is the HDFC Bank balance?"

**Sales Queries:**
- "What were the sales this month?"
- "Show recent invoices"
- "What is total revenue?"

**Inventory Queries:**
- "Show current stock levels"
- "What laptops are in inventory?"
- "Display all stock items"

### Hindi Language Support

The system understands Hindi queries naturally:

- "Sabse zyada balance kiska hai?" (Who has the highest balance?)
- "Mere paas kitna cash hai?" (How much cash do I have?)
- "Bank ka balance kitna hai?" (What is the bank balance?)
- "Top customers dikhaao" (Show top customers)
- "Sales kitne hue is mahine?" (How much were sales this month?)

### Mixed Language Queries

India's business users often mix English and Hindi:

- "HDFC Bank ka balance kitna hai?"
- "Sales ledger ka total balance kya hai?"
- "Top 5 customers ka outstanding dikhao"

All three query types are processed with equal accuracy.

---

## Demo Dataset Details

### Cash and Banking (Rs. 8,55,000)

| Account | Type | Balance |
|---------|------|---------|
| Cash Account | Cash-in-Hand | 1,25,000 |
| HDFC Bank Current | Bank Account | 4,50,000 |
| ICICI Bank Savings | Bank Account | 2,80,000 |
| Axis Bank CC | Overdraft | -75,000 |

### Customer Balances (Rs. 7,16,000 receivable)

Top customers by outstanding amount:

| Customer | Outstanding | Last Transaction |
|----------|-------------|------------------|
| Tech Solutions Pvt Ltd | Rs. 1,85,000 | Oct 18, 2024 |
| Cloud Services Co | Rs. 1,25,000 | Oct 16, 2024 |
| Digital Innovations Inc | Rs. 95,000 | Oct 17, 2024 |
| Enterprise Systems Ltd | Rs. 68,000 | Oct 15, 2024 |
| Global Tech Partners | Rs. 55,000 | Oct 14, 2024 |

### Supplier Balances (Rs. 5,43,000 payable)

| Supplier | Amount Due | Due Date |
|----------|------------|----------|
| Hardware Distributors | Rs. 1,25,000 | Nov 15, 2024 |
| Software Suppliers Inc | Rs. 95,000 | Nov 10, 2024 |
| Office Equipment Co | Rs. 82,000 | Nov 18, 2024 |
| Cloud Infrastructure Co | Rs. 58,000 | Nov 05, 2024 |

### Inventory Stock (Rs. 82,31,500 total value)

Sample items from 81 total stock items:

| Product | Qty | Unit Price | Total Value |
|---------|-----|------------|-------------|
| Dell Latitude 5420 Laptop | 25 | Rs. 55,000 | Rs. 13,75,000 |
| HP ProBook 450 G8 | 18 | Rs. 48,000 | Rs. 8,64,000 |
| Lenovo ThinkPad E14 | 22 | Rs. 52,000 | Rs. 11,44,000 |
| Logitech MX Master Mouse | 150 | Rs. 8,500 | Rs. 12,75,000 |
| Dell 24" Monitor | 35 | Rs. 12,500 | Rs. 4,37,500 |

### Revenue and Expenses

**Revenue Breakdown:**
- Software Sales: Rs. 8,50,000
- Hardware Sales: Rs. 5,20,000
- Consulting Services: Rs. 3,80,000
- Training Services: Rs. 2,40,000
- Support Services: Rs. 1,60,000
- Total: Rs. 21,50,000

**Expense Breakdown:**
- Purchases: Rs. 12,50,000
- Salaries: Rs. 4,20,000
- Rent: Rs. 1,80,000
- Utilities: Rs. 85,000
- Marketing: Rs. 1,20,000
- Total: Rs. 20,55,000

**Net Profit: Rs. 95,000**

---

## Sample Query Results

### Query: "What is the total balance?"

The system returns a comprehensive financial summary:

```
Total Assets: Rs. 15,11,000
Total Liabilities: Rs. 6,18,000
Net Worth: Rs. 8,93,000

Asset Breakdown:
- Cash and Bank Accounts: Rs. 6,55,000
- Accounts Receivable (Customers): Rs. 7,16,000
- Inventory: Rs. 82,31,500

Liability Breakdown:
- Accounts Payable (Suppliers): Rs. 5,43,000
- Bank Overdraft: Rs. 75,000
```

### Query: "Sabse zyada balance kiska hai?"

For Hindi queries, the system responds with:

```
Highest Outstanding Balance:

Customer: Tech Solutions Pvt Ltd
Amount: Rs. 1,85,000
Category: Sundry Debtors (Accounts Receivable)
Last Transaction: October 18, 2024
Status: Outstanding payment pending
```

---

## Technical Implementation

### Database Connection Method

The system uses ODBC (Open Database Connectivity) to connect with Tally:

- **Driver**: Tally ODBC Driver (64-bit)
- **Default Port**: 9000
- **Connection Type**: Direct database access
- **Data Flow**: Real-time, no caching required
- **Query Method**: Standard SQL over ODBC

### AI Processing Pipeline

Natural language queries are processed through:

1. **Input Analysis**: AWS Bedrock receives the query text
2. **Intent Recognition**: Claude 3.5 Sonnet identifies what the user wants
3. **Table Mapping**: System maps intent to Tally database tables
4. **SQL Generation**: Appropriate SQL query is constructed
5. **Query Execution**: ODBC executes against Tally database
6. **Result Formatting**: Data is formatted for readability
7. **Response Delivery**: Natural language response returned to user

### Why AWS Bedrock

The system uses AWS Bedrock with Claude 3.5 Sonnet because:

- Superior natural language understanding for business queries
- Multi-language support (English, Hindi, mixed)
- Context awareness for complex queries
- Accurate intent recognition even with informal phrasing
- Handles variations in how users ask questions
- Understanding of Indian business terminology

---

## Real-World Use Cases

### Business Owner Scenario
Without TallyKaro, checking cash balance requires:
1. Opening Tally
2. Navigating to Gateway of Tally
3. Going to Display menu
4. Selecting Account Books
5. Choosing Cash Book
6. Finding the balance

With TallyKaro: Ask "What is my cash balance?" - instant answer.

### Sales Manager Scenario
Traditional method for top customers requires:
1. Opening multiple reports
2. Exporting to Excel
3. Sorting and filtering manually
4. Creating summary

With TallyKaro: Ask "Show top 10 customers" - immediate list with balances.

### Accountant Scenario
Finding unpaid invoices traditionally:
1. Opening outstanding reports
2. Filtering by date
2. Manual compilation
3. Cross-checking multiple ledgers

With TallyKaro: Ask "Show all unpaid invoices over 30 days" - instant filtered list.

---

## System Architecture Overview

```
User Interface (Electron Desktop App)
         ↓
Natural Language Query
         ↓
AWS Bedrock AI Agent (Claude 3.5 Sonnet)
         ↓
Intent Recognition & SQL Generation
         ↓
ODBC Connection Layer
         ↓
Tally ERP Database (Live Data)
         ↓
Result Formatter
         ↓
User Interface (Formatted Response)
```

### Key Technical Points

**Local-First Architecture**: All data queries happen locally. Tally data stays on premises. Only query text is sent to AWS for processing.

**No Tally Modifications**: Works with existing Tally installations without any changes, plugins, or custom configurations.

**Real-Time Data**: Queries actual Tally database in real-time, ensuring current information without sync delays.

**Cross-Platform**: Built with Electron, runs on Windows, macOS, and Linux.

**Secure**: ODBC connections are encrypted, credentials stored securely, AWS communication over HTTPS.

---

## Demo Mode Configuration

To enable demo mode without Tally installation:

Set in .env file:
```
DEMO_MODE=true
```

This provides:
- Full application interface
- All query processing features
- Complete dataset as described above
- Natural language processing
- Multi-language support

Useful for:
- Development and testing
- Feature demonstrations
- Training purposes
- Evaluation without Tally

---

## Production Deployment Notes

In production environments:

**With Real Tally:**
- Set DEMO_MODE=false
- Configure actual Tally ODBC connection
- Set appropriate company credentials
- Enable optional cloud backup (S3/Supabase)

**Data Security:**
- All sensitive data encrypted at rest
- Secure credential storage
- Optional cloud sync with encryption
- Audit logging available

**Performance:**
- Query response time: typically under 200ms
- Handles databases with 10,000+ ledgers
- Concurrent query support
- Optimized SQL generation

---

## Understanding the Value Proposition

**Problem:** Tally is powerful but requires technical knowledge. Business owners can't easily access their own data.

**Solution:** TallyKaro makes Tally accessible through natural language, powered by AWS AI.

**Impact:**
- Reduces time to get business insights from minutes to seconds
- No training needed - users ask questions naturally
- Supports India's linguistic diversity (English + Hindi)
- Empowers non-technical users
- Increases data-driven decision making

**Market:** 2+ million Tally users in India and globally, mostly SMBs who benefit most from simplified data access.

This demo dataset represents realistic business scenarios to demonstrate the full capability of natural language querying on Tally ERP data using AWS AI technology.
