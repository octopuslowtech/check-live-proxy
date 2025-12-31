# Proxy Checker - High Performance

Tool kiểm tra proxy với hiệu năng cao, hỗ trợ kiểm tra kết nối đến domain cụ thể hoặc lấy IP thực của proxy.

## ✨ Tính năng

- 🚀 **Hiệu năng cao**: Kiểm tra đồng thời 50 proxy
- 📡 **Realtime**: Hiển thị kết quả kiểm tra từng proxy theo thời gian thực
- 🎯 **Flexible**: Hỗ trợ 2 chế độ - check IP hoặc check domain cụ thể
- ⚙️ **Configurable**: Tùy chỉnh số round, delay, min success
- 📋 **Copy All**: Sao chép danh sách proxy live/die với 1 click

## 🚀 Cài đặt

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/check-live-proxy.git
cd check-live-proxy

# Cài đặt dependencies
npm install

# Chạy server
npm start
```

Mở trình duyệt: http://localhost:3000

## 📝 Định dạng Proxy

```
# Không có auth
ip:port

# Có auth
ip:port:username:password
```

**Ví dụ:**
```
103.152.112.162:8080
192.168.1.1:3128:myuser:mypass123
45.77.123.45:8888
```

## ⚙️ Chế độ kiểm tra

### 1. Check IP (Mặc định)
- Request đến `https://ipconfig.io/json`
- Lấy IP thực của proxy
- Kiểm tra 1 lần, thành công = LIVE

### 2. Check Domain cụ thể
Tick vào checkbox "Kiểm tra domain cụ thể" để:
- Nhập domain muốn kiểm tra (VD: `https://www.tiktok.com`)
- Cấu hình số round kiểm tra (1-20)
- Cấu hình delay giữa các round (1-60 giây)
- Cấu hình min success (cần > số này lần thành công để tính là LIVE)

**Ví dụ:** 5 round, min success = 3 → Proxy cần thành công 4+ lần mới là LIVE

## 📊 Kết quả

- **✓ Live**: Proxy kết nối thành công
- **✗ Die**: Proxy không thể kết nối hoặc không đủ số lần thành công
- Hiển thị IP thực của proxy (khi check IP mode)
- Click "Copy All" để sao chép danh sách

## 💡 Lưu ý

- Tool kiểm tra đồng thời 50 proxy để tối ưu hiệu năng
- Timeout mỗi request là 10 giây
- Khi kiểm tra domain cụ thể (như TikTok), một số quốc gia có thể bị chặn

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: Vanilla HTML/CSS/JS
- **Streaming**: Server-Sent Events (SSE)

## 📄 License

MIT
