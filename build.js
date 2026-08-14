const fs = require('fs');
const path = require('path');

// جميع ملفات المشروع
const files = {
  'backend/package.json': JSON.stringify({
    name: "vente-backend",
    version: "1.0.0",
    scripts: { start: "node server.js", dev: "nodemon server.js" },
    dependencies: {
      express: "^4.18.2",
      mongoose: "^7.0.0",
      cors: "^2.8.5",
      dotenv: "^16.0.3",
      jsonwebtoken: "^9.0.0",
      bcryptjs: "^2.4.3",
      multer: "^1.4.5",
      socketio: "^4.5.4"
    },
    devDependencies: { nodemon: "^2.0.20" }
  }, null, 2),
  
  'backend/.env': `PORT=5000\nMONGODB_URI=mongodb://localhost:27017/vente\nJWT_SECRET=vente_super_secret_key_2026\nSERVER_URL=http://localhost:5000`,
  
  'backend/config/database.js': `const mongoose = require('mongoose');
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Error:', error.message);
    process.exit(1);
  }
};
module.exports = connectDB;`,
  
  'backend/middleware/auth.js': `const jwt = require('jsonwebtoken');
module.exports = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'رمز غير صالح' });
  }
};`,
  
  'backend/models/User.js': `const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  avatar: { type: String, default: 'https://ui-avatars.com/api/?background=FF0050&color=fff&size=128' },
  bio: { type: String, default: '🎬 مبدع فيديوهات قصيرة' },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isLive: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  stats: { totalViews: { type: Number, default: 0 }, totalLikes: { type: Number, default: 0 }, totalVideos: { type: Number, default: 0 } },
  createdAt: { type: Date, default: Date.now }
});
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};
UserSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};
module.exports = mongoose.model('User', UserSchema);`,
  
  'backend/models/Video.js': `const mongoose = require('mongoose');
const VideoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url: { type: String, required: true },
  thumbnail: { type: String, required: true },
  description: { type: String, maxlength: 500, default: '' },
  hashtags: [String],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  views: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  isPrivate: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Video', VideoSchema);`,
  
  'backend/models/Notification.js': `const mongoose = require('mongoose');
const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['like', 'comment', 'follow', 'live'], required: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  text: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Notification', NotificationSchema);`,
  
  'backend/routes/auth.js': `const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) return res.status(400).json({ error: 'المستخدم موجود بالفعل' });
    const user = new User({ username, email, password });
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user._id, username, email, avatar: user.avatar } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'البريد غير صحيح' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, email, avatar: user.avatar } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;`,
  
  'backend/routes/users.js': `const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Video = require('../models/Video');
const auth = require('../middleware/auth');

router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password')
      .populate('followers', 'username avatar')
      .populate('following', 'username avatar');
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const videos = await Video.find({ userId: req.params.userId, isPrivate: false }).sort({ createdAt: -1 });
    const stats = { followers: user.followers.length, following: user.following.length, videos: videos.length };
    res.json({ user, videos, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/follow/:userId', auth, async (req, res) => {
  try {
    if (req.params.userId === req.userId) return res.status(400).json({ error: 'لا يمكن متابعة نفسك' });
    const user = await User.findById(req.userId);
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const isFollowing = user.following.includes(req.params.userId);
    if (isFollowing) {
      user.following = user.following.filter(id => id.toString() !== req.params.userId);
      targetUser.followers = targetUser.followers.filter(id => id.toString() !== req.userId);
    } else {
      user.following.push(req.params.userId);
      targetUser.followers.push(req.userId);
    }
    await user.save();
    await targetUser.save();
    res.json({ success: true, isFollowing: !isFollowing, followersCount: targetUser.followers.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ users: [], videos: [] });
    const users = await User.find({ username: { $regex: q, $options: 'i' } }).select('-password').limit(20);
    const videos = await Video.find({ description: { $regex: q, $options: 'i' }, isPrivate: false })
      .populate('userId', 'username avatar').limit(20);
    res.json({ users, videos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { username, bio, avatar } = req.body;
    const user = await User.findById(req.userId);
    if (username) user.username = username;
    if (bio) user.bio = bio;
    if (avatar) user.avatar = avatar;
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;`,
  
  'backend/routes/videos.js': `const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Video = require('../models/Video');
const auth = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads/videos';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'));
  }
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

router.post('/upload', auth, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'الرجاء اختيار فيديو' });
    const { description } = req.body;
    const video = new Video({
      userId: req.userId,
      url: \`\${process.env.SERVER_URL}/uploads/videos/\${req.file.filename}\`,
      thumbnail: \`\${process.env.SERVER_URL}/uploads/videos/\${req.file.filename}\`,
      description: description || ''
    });
    await video.save();
    res.status(201).json(video);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const videos = await Video.find({ isPrivate: false })
      .populate('userId', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/like/:videoId', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId);
    if (!video) return res.status(404).json({ error: 'الفيديو غير موجود' });
    const isLiked = video.likes.includes(req.userId);
    if (isLiked) {
      video.likes = video.likes.filter(id => id.toString() !== req.userId);
    } else {
      video.likes.push(req.userId);
    }
    await video.save();
    res.json({ liked: !isLiked, likesCount: video.likes.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;`,
  
  'backend/routes/notifications.js': `const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.userId })
      .populate('fromUserId', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(30);
    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.userId, read: false }, { read: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;`,
  
  'backend/server.js': `require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const connectDB = require('./config/database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

connectDB();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/notifications', require('./routes/notifications'));

io.on('connection', (socket) => {
  console.log('🟢 User connected:', socket.id);
  socket.on('start-live', ({ userId, roomId }) => {
    socket.join(roomId);
    io.emit('live-started', { roomId, userId });
  });
  socket.on('join-live', ({ roomId, userId }) => {
    socket.join(roomId);
    io.to(roomId).emit('viewer-joined', { userId });
  });
  socket.on('end-live', ({ roomId }) => {
    io.to(roomId).emit('live-ended');
    io.socketsLeave(roomId);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(\`🚀 Vente Server on port \${PORT}\`));`
};

// إنشاء المشروع
function createProject() {
  const basePath = path.join(process.cwd(), 'Vente-App');
  
  // إنشاء المجلدات والملفات
  Object.entries(files).forEach(([filePath, content]) => {
    const fullPath = path.join(basePath, filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
    console.log(`✅ Created: ${filePath}`);
  });
  
  console.log('\n🎉 Project created successfully!');
  console.log(`📁 Location: ${basePath}`);
  console.log('\n📝 Next steps:');
  console.log('1. cd Vente-App/backend');
  console.log('2. npm install');
  console.log('3. npm run dev');
}

createProject();
