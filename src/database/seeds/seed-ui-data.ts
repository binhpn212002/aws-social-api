import axios from 'axios';
import { Client } from 'pg';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';

// Database config from .env or defaults
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'social_db',
};

// 1. All Users aggregated from the UI
const UI_USERS = [
  {
    username: 'alex_dev',
    email: 'alex.dev@example.com',
    fullName: 'Alex Johnson',
    password: 'Password123@',
    role: 'ADMIN',
    headline: 'Senior Cloud Solutions Architect & Full-Stack Developer',
    bio: 'Xây dựng các ứng dụng quy mô lớn với AWS Serverless, Next.js và kiến trúc Event-Driven. Đam mê chia sẻ kiến thức mã nguồn mở và cloud computing 🚀☁️',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300',
  },
  {
    username: 'huy_architect',
    email: 'huy.architect@example.com',
    fullName: 'Trần Quang Huy',
    password: 'Password123@',
    role: 'USER',
    headline: 'AWS Solutions Architect',
    bio: 'Đam mê Serverless, DynamoDB Global Tables và kiến trúc microservices phân tán chịu tải cao.',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150',
  },
  {
    username: 'thaonhi_devops',
    email: 'thaonhi.devops@example.com',
    fullName: 'Nguyễn Thảo Nhi',
    password: 'Password123@',
    role: 'USER',
    headline: 'DevOps Engineer @ AWS',
    bio: 'Chuyên gia CI/CD, Terraform, Kubernetes và AWS Cloud Infrastructure.',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
  },
  {
    username: 'huong_uiux',
    email: 'huong.uiux@example.com',
    fullName: 'Lê Mai Hương',
    password: 'Password123@',
    role: 'USER',
    headline: 'Senior Product Designer & UI/UX Specialist',
    bio: 'Tối ưu trải nghiệm người dùng hiện đại và thiết kế Design System cho sản phẩm quy mô lớn.',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
  },
  {
    username: 'quocbao_dev',
    email: 'quocbao.dev@example.com',
    fullName: 'Vũ Quốc Bảo',
    password: 'Password123@',
    role: 'USER',
    headline: 'Backend Node.js & Cloud Developer',
    bio: 'Xây dựng RESTful & WebSocket API tốc độ cao, Redis Caching và NestJS microservices.',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
  },
  {
    username: 'minhhoang_se',
    email: 'minhhoang.se@example.com',
    fullName: 'Minh Hoàng',
    password: 'Password123@',
    role: 'USER',
    headline: 'Software Engineer @ Cloud Enterprise',
    bio: 'Đam mê clean code, Docker containerization và hệ thống phân tán.',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
  },
  {
    username: 'lananh_nguyen',
    email: 'lananh.nguyen@example.com',
    fullName: 'Lan Anh Nguyễn',
    password: 'Password123@',
    role: 'USER',
    headline: 'Cloud Solutions & Security Engineer',
    bio: 'Tập trung vào bảo mật đám mây, IAM chính sách và Audit Logs DynamoDB.',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
  },
  {
    username: 'thutrang_cloud',
    email: 'thutrang.cloud@example.com',
    fullName: 'Thu Trang',
    password: 'Password123@',
    role: 'USER',
    headline: 'AWS Cloud Architect & Data Specialist',
    bio: 'Phân tích dữ liệu lớn trên AWS Redshift, Glue và Athena.',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  },
];

type SeededUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  token: string;
};

async function seed() {
  console.log('====================================================');
  console.log('🚀 BẮT ĐẦU SEEDING DỮ LIỆU TỪ UI QUA API & POSTGRES');
  console.log('====================================================');
  console.log(`🌐 API Endpoint: ${API_BASE_URL}`);

  const userTokens: Record<string, SeededUser> = {};

  // ----------------------------------------------------
  // BƯỚC 1: ĐĂNG KÝ HOẶC ĐĂNG NHẬP CÁC TÀI KHOẢN QUA API
  // ----------------------------------------------------
  console.log('\n--- BƯỚC 1: GỌI AUTH API ĐỂ ĐĂNG KÝ/ĐĂNG NHẬP USER ---');

  for (const user of UI_USERS) {
    try {
      // 1. Thử đăng ký mới
      const registerRes = await axios.post(`${API_BASE_URL}/auth/register`, {
        email: user.email,
        username: user.username,
        password: user.password,
        fullName: user.fullName,
      });

      const data = registerRes.data.data;
      userTokens[user.username] = {
        id: data.user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        token: data.tokens.accessToken,
      };
      console.log(`✅ [Đăng ký mới thành công]: ${user.fullName} (@${user.username}) -> ID: ${data.user.id}`);
    } catch (err: any) {
      if (err.response?.status === 409) {
        // 2. Nếu đã tồn tại, thực hiện đăng nhập để lấy token & ID
        try {
          const loginRes = await axios.post(`${API_BASE_URL}/auth/login`, {
            identifier: user.username,
            password: user.password,
          });
          const data = loginRes.data.data;
          userTokens[user.username] = {
            id: data.user.id,
            username: user.username,
            fullName: user.fullName,
            email: user.email,
            token: data.tokens.accessToken,
          };
          console.log(`ℹ️ [Đã tồn tại -> Đăng nhập thành công]: ${user.fullName} (@${user.username}) -> ID: ${data.user.id}`);
        } catch (loginErr: any) {
          console.error(`❌ Đăng nhập thất bại cho @${user.username}:`, loginErr.response?.data || loginErr.message);
        }
      } else {
        console.error(`❌ Lỗi đăng ký @${user.username}:`, err.response?.data || err.message);
      }
    }
  }

  // ----------------------------------------------------
  // BƯỚC 2: CẬP NHẬT AVATAR URL, BIO & ROLE TRONG DATABASE
  // ----------------------------------------------------
  console.log('\n--- BƯỚC 2: CẬP NHẬT AVATAR_URL, BIO, ROLE TRONG POSTGRESQL ---');
  const pgClient = new Client(dbConfig);
  try {
    await pgClient.connect();
    console.log('✅ Đã kết nối PostgreSQL!');

    for (const user of UI_USERS) {
      const seeded = userTokens[user.username];
      if (seeded) {
        await pgClient.query(
          `UPDATE users 
           SET avatar_url = $1, bio = $2, role = $3, updated_at = NOW() 
           WHERE id = $4`,
          [user.avatarUrl, user.bio, user.role, seeded.id],
        );
        console.log(`🖼️ [Cập nhật Avatar & Bio]: ${user.fullName} (${user.role})`);
      }
    }
  } catch (dbErr: any) {
    console.error('❌ Lỗi cập nhật PostgreSQL:', dbErr.message);
  } finally {
    await pgClient.end();
  }

  const alex = userTokens['alex_dev'];
  const huy = userTokens['huy_architect'];
  const nhi = userTokens['thaonhi_devops'];
  const huong = userTokens['huong_uiux'];
  const bao = userTokens['quocbao_dev'];
  const hoang = userTokens['minhhoang_se'];
  const trang = userTokens['thutrang_cloud'];

  if (!alex) {
    console.error('❌ Không tìm thấy Alex Johnson, dừng seeding.');
    return;
  }

  // ----------------------------------------------------
  // BƯỚC 3: TẠO QUAN HỆ BẠN BÈ VÀ LỜI MỜI QUA FRIEND API
  // ----------------------------------------------------
  console.log('\n--- BƯỚC 3: GỌI FRIEND API TẠO BẠN BÈ & LỜI MỜI KẾT BẠN ---');

  const createFriendship = async (userA: SeededUser, userB: SeededUser, accept = true) => {
    try {
      const res = await axios.post(
        `${API_BASE_URL}/friends/requests`,
        { addresseeId: userB.id },
        { headers: { Authorization: `Bearer ${userA.token}` } },
      );
      const friendship = res.data.data;
      console.log(`📩 ${userA.fullName} đã gửi lời mời kết bạn tới ${userB.fullName}`);

      if (accept && friendship?.id) {
        await axios.patch(
          `${API_BASE_URL}/friends/requests/${friendship.id}/accept`,
          {},
          { headers: { Authorization: `Bearer ${userB.token}` } },
        );
        console.log(`🤝 ${userB.fullName} đã CHẤP NHẬN lời mời từ ${userA.fullName}`);
      }
    } catch (err: any) {
      // Có thể đã là bạn bè trước đó
      if (err.response?.status === 409) {
        console.log(`ℹ️ ${userA.fullName} và ${userB.fullName} đã có quan hệ bạn bè từ trước`);
      } else {
        console.log(`⚠️ Lỗi kết bạn ${userA.username} -> ${userB.username}:`, err.response?.data?.message || err.message);
      }
    }
  };

  // Alex kết bạn với Huy, Nhi, Hương, Bảo
  if (huy) await createFriendship(alex, huy, true);
  if (nhi) await createFriendship(alex, nhi, true);
  if (huong) await createFriendship(alex, huong, true);
  if (bao) await createFriendship(alex, bao, true);

  // Hoàng và Trang gửi lời mời kết bạn tới Alex (để Alex có 2 lời mời kết bạn ở tab 'Lời mời')
  if (hoang) await createFriendship(hoang, alex, false);
  if (trang) await createFriendship(trang, alex, false);

  // ----------------------------------------------------
  // BƯỚC 4: TẠO BÀI VIẾT QUA POST API
  // ----------------------------------------------------
  console.log('\n--- BƯỚC 4: GỌI POST API TẠO BÀI VIẾT (NEWS FEED) ---');

  const samplePosts = [
    {
      author: alex,
      content:
        '📌 [GHIM] Tổng kết kiến trúc AWS Microservices cho hệ thống mạng xã hội: Áp dụng Amazon DynamoDB Global Tables, S3 Presigned Upload và EventBridge Scheduler. Đạt 99.99% uptime với chi phí tối ưu! 🚀☁️ #AWS #CloudArchitecture #Serverless',
      privacy: 'PUBLIC',
    },
    {
      author: huy,
      content:
        'Vừa triển khai xong kiến trúc Serverless Event-Driven hoàn chỉnh kết hợp Amazon DynamoDB Global Tables, Lambda và SQS FIFO! Độ trễ dưới 25ms ở mọi region. Cảm ơn team đã đồng hành 🚀🔥 #AWS #Serverless #Architecture',
      privacy: 'PUBLIC',
    },
    {
      author: huong,
      content:
        'Thiết kế giao diện Dark/Light mode mới cho AWS Social Network đã hoàn thành xong bản phác thảo prototype. Mọi người thích tông màu Indigo & Sky hay Slate hơn? Cho mình xin feedback nhé! 🎨✨',
      privacy: 'PUBLIC',
    },
    {
      author: nhi,
      content:
        'Hoàn tất thiết lập pipeline CI/CD đa môi trường với Terraform và AWS CodePipeline! Giờ đây code merge vào main là tự động build, test và deploy lên CloudFront trong vòng 3 phút. 🛠️⚡ #DevOps #CICD #Terraform',
      privacy: 'PUBLIC',
    },
    {
      author: alex,
      content:
        'Vừa cập nhật xong module bảo mật Audit Logs tích hợp DynamoDB Single-Table Design. Bây giờ có thể tra cứu lịch sử an ninh O(1) theo User ID và mốc thời gian cực kỳ mượt mà. 🛡️⚡',
      privacy: 'FRIENDS',
    },
  ];

  const createdPostIds: string[] = [];

  for (const p of samplePosts) {
    if (!p.author) continue;
    try {
      const res = await axios.post(
        `${API_BASE_URL}/posts`,
        {
          content: p.content,
          privacy: p.privacy,
        },
        { headers: { Authorization: `Bearer ${p.author.token}` } },
      );
      const post = res.data.data;
      createdPostIds.push(post.id);
      console.log(`📝 [Tạo bài viết]: Tác giả: ${p.author.fullName} -> Post ID: ${post.id}`);
    } catch (err: any) {
      console.log(`⚠️ Lỗi tạo post bởi ${p.author.username}:`, err.response?.data?.message || err.message);
    }
  }

  // ----------------------------------------------------
  // BƯỚC 5: TƯƠNG TÁC LIKE BÀI VIẾT QUA POST API
  // ----------------------------------------------------
  console.log('\n--- BƯỚC 5: GỌI LIKE API TƯƠNG TÁC THẢ TIM BÀI VIẾT ---');
  for (const postId of createdPostIds) {
    for (const u of [alex, huy, nhi, huong]) {
      if (!u) continue;
      try {
        await axios.post(
          `${API_BASE_URL}/posts/${postId}/like`,
          {},
          { headers: { Authorization: `Bearer ${u.token}` } },
        );
        console.log(`❤️  ${u.fullName} đã thích bài viết: ${postId}`);
      } catch {
        // Bỏ qua nếu đã like
      }
    }
  }

  // ----------------------------------------------------
  // BƯỚC 6: TẠO HỘI THOẠI & TIN NHẮN QUA CHAT API
  // ----------------------------------------------------
  console.log('\n--- BƯỚC 6: GỌI CHAT API TẠO HỘI THOẠI & TIN NHẮN ---');

  if (nhi) {
    try {
      // 1. Tạo chat 1-1 giữa Alex và Nhi
      const directChatRes = await axios.post(
        `${API_BASE_URL}/chat/conversations`,
        {
          type: 'DIRECT',
          recipientId: nhi.id,
        },
        { headers: { Authorization: `Bearer ${alex.token}` } },
      );
      const directConv = directChatRes.data.data;
      console.log(`💬 Đã tạo hội thoại 1-1: Alex & Nhi -> Conv ID: ${directConv.id}`);

      // Gửi tin nhắn
      await axios.post(
        `${API_BASE_URL}/chat/conversations/${directConv.id}/messages`,
        {
          conversationId: directConv.id,
          content: 'Chào Alex! Bạn đã kiểm tra tính năng S3 presigned URL chưa?',
        },
        { headers: { Authorization: `Bearer ${nhi.token}` } },
      );
      await axios.post(
        `${API_BASE_URL}/chat/conversations/${directConv.id}/messages`,
        {
          conversationId: directConv.id,
          content: 'Mình vừa test xong rồi Nhi, tốc độ upload trực tiếp rất mượt mà!',
        },
        { headers: { Authorization: `Bearer ${alex.token}` } },
      );
      console.log('✉️  Đã gửi tin nhắn mẫu cho hội thoại 1-1');
    } catch (err: any) {
      console.log('ℹ️ Hội thoại 1-1:', err.response?.data?.message || err.message);
    }
  }

  if (huy && nhi && huong) {
    try {
      // 2. Tạo Group Chat "AWS Architecture Group"
      const groupChatRes = await axios.post(
        `${API_BASE_URL}/chat/conversations`,
        {
          type: 'GROUP',
          name: 'AWS Architecture Group',
          memberIds: [huy.id, nhi.id, huong.id],
        },
        { headers: { Authorization: `Bearer ${alex.token}` } },
      );
      const groupConv = groupChatRes.data.data;
      console.log(`👥 Đã tạo nhóm chat: "AWS Architecture Group" -> Conv ID: ${groupConv.id}`);

      await axios.post(
        `${API_BASE_URL}/chat/conversations/${groupConv.id}/messages`,
        {
          conversationId: groupConv.id,
          content: 'Huy: Đã cập nhật spec DynamoDB Single Table Design cho team rồi nhé!',
        },
        { headers: { Authorization: `Bearer ${huy.token}` } },
      );
      await axios.post(
        `${API_BASE_URL}/chat/conversations/${groupConv.id}/messages`,
        {
          conversationId: groupConv.id,
          content: 'Alex: Tuyệt vời, lát họp 15h chúng ta review nhé mọi người.',
        },
        { headers: { Authorization: `Bearer ${alex.token}` } },
      );
      console.log('✉️  Đã gửi tin nhắn mẫu cho nhóm chat');
    } catch (err: any) {
      console.log('ℹ️ Nhóm chat:', err.response?.data?.message || err.message);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 HOÀN TẤT SEEDING TOÀN BỘ USER VÀ DỮ LIỆU TỪ UI!');
  console.log('====================================================');
}

seed().catch((e) => {
  console.error('Fatal Seeding Error:', e);
  process.exit(1);
});
