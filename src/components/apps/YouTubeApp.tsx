import React, { useState } from 'react';
import {
  Search,
  ThumbsUp,
  ThumbsDown,
  Share2,
  Bookmark,
  MessageSquare,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Compass,
  Flame,
  Music2,
  Gamepad2,
  Tv2,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';

interface YouTubeVideo {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  channelAvatar: string;
  subscribers: string;
  views: string;
  uploadedTime: string;
  duration: string;
  thumbnail: string;
  category: string;
  likes: string;
  description: string;
  comments: { user: string; text: string; time: string; likes: string }[];
}

const CURATED_VIDEOS: YouTubeVideo[] = [
  {
    id: 'yt-1',
    youtubeId: 'f02mOEt11OQ', // Official Google Pixel 7 Pro
    title: 'Google Pixel 7 Pro: Official Introduction & Tensor G2 Architecture',
    channel: 'Made by Google',
    channelAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&auto=format&fit=crop&q=80',
    subscribers: '1.8M',
    views: '4.2M views',
    uploadedTime: '1 year ago',
    duration: '2:45',
    thumbnail: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=640&auto=format&fit=crop&q=80',
    category: 'Pixel 7 Pro',
    likes: '142K',
    description: 'Meet Pixel 7 Pro, Google\'s most powerful phone ever. Powered by the next-gen Google Tensor G2 processor.',
    comments: [
      { user: 'AndroidDev_Farm', text: 'Running 10 of these on our virtual farm cluster! Tensor G2 virtualization is buttery smooth.', time: '2 days ago', likes: '1.2K' },
      { user: 'CheetahKernel', text: 'The camera bump and Hazel finish look gorgeous in person.', time: '1 week ago', likes: '340' },
      { user: 'DockerCloud', text: 'Great hardware specs for multi-device ADB orchestration.', time: '3 weeks ago', likes: '89' },
    ],
  },
  {
    id: 'yt-2',
    youtubeId: 'kJQP7kiw5Fk', // Popular high-bitrate music
    title: 'Luis Fonsi - Despacito ft. Daddy Yankee (Official Music Video 4K)',
    channel: 'Luis Fonsi',
    channelAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80',
    subscribers: '31.4M',
    views: '8.4B views',
    uploadedTime: '7 years ago',
    duration: '4:41',
    thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=640&auto=format&fit=crop&q=80',
    category: 'Music',
    likes: '52M',
    description: 'Watch the official music video with over 8 billion views worldwide.',
    comments: [
      { user: 'GlobalBeats', text: 'Still the undisputed king of YouTube streams in 2026!', time: '1 day ago', likes: '5.4K' },
      { user: 'MusicLover99', text: 'Testing audio decoding across all 10 Pixel farm devices.', time: '3 days ago', likes: '412' },
    ],
  },
  {
    id: 'yt-3',
    youtubeId: '5qap5aO4i9A', // Lofi Beats to Relax/Study to
    title: 'lofi hip hop radio 📚 - beats to relax/study to [24/7 Live]',
    channel: 'Lofi Girl',
    channelAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&auto=format&fit=crop&q=80',
    subscribers: '14.2M',
    views: '290M views',
    uploadedTime: 'Live stream',
    duration: 'LIVE',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=640&auto=format&fit=crop&q=80',
    category: 'Live',
    likes: '8.9M',
    description: 'Peaceful lofi hip hop radio stream for coding, focus, and background multi-device testing.',
    comments: [
      { user: 'CodeRunner', text: 'Listening while managing my 10 Pixel 7 Pro emulators on Docker.', time: '5 hours ago', likes: '890' },
      { user: 'StudyVibe', text: 'Perfect soundtrack for full-stack engineering.', time: '1 day ago', likes: '230' },
    ],
  },
  {
    id: 'yt-4',
    youtubeId: 'LXb3EKWsInQ', // 4K Nature
    title: 'COSTA RICA IN 4K 60FPS HDR (Ultra HD) Nature Wildlife',
    channel: 'Jacob & Katie Schwarz',
    channelAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80',
    subscribers: '1.2M',
    views: '112M views',
    uploadedTime: '4 years ago',
    duration: '5:14',
    thumbnail: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=640&auto=format&fit=crop&q=80',
    category: 'Tech',
    likes: '1.1M',
    description: 'Captured in 60fps Ultra HD to test GPU rendering performance and OLED display capability.',
    comments: [
      { user: 'DisplayTester', text: 'Pixel 7 Pro OLED QHD+ panel makes this look ridiculously sharp.', time: '4 days ago', likes: '310' },
    ],
  },
  {
    id: 'yt-5',
    youtubeId: 'dQw4w9WgXcQ', // Classic
    title: 'Rick Astley - Never Gonna Give You Up (Official Music Video 4K Remastered)',
    channel: 'Rick Astley',
    channelAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&auto=format&fit=crop&q=80',
    subscribers: '4.8M',
    views: '1.5B views',
    uploadedTime: '14 years ago',
    duration: '3:33',
    thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=640&auto=format&fit=crop&q=80',
    category: 'Music',
    likes: '16M',
    description: 'The legendary music video remastered in pristine 4K 60fps.',
    comments: [
      { user: 'InternetHistorian', text: 'A phone farm is not truly tested until you Rickroll all 10 phones at once!', time: '12 hours ago', likes: '9.8K' },
    ],
  },
  {
    id: 'yt-6',
    youtubeId: 'M7lc1UVf-VE', // YouTube Dev Demo
    title: 'Google I/O: Android 14 & AI Core Developer Keynote',
    channel: 'Android Developers',
    channelAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&auto=format&fit=crop&q=80',
    subscribers: '1.5M',
    views: '890K views',
    uploadedTime: '8 months ago',
    duration: '12:04',
    thumbnail: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=640&auto=format&fit=crop&q=80',
    category: 'Tech',
    likes: '48K',
    description: 'Explore the latest features for Android 14 API level 34 on Pixel devices.',
    comments: [
      { user: 'DevGoogle', text: 'Cheetah user-build 14 API 34 is running perfectly in the sandbox!', time: '2 days ago', likes: '140' },
    ],
  },
];

const CATEGORIES = ['All', 'Pixel 7 Pro', 'Music', 'Tech', 'Live'];

interface YouTubeAppProps {
  deviceId?: string;
  isMini?: boolean;
}

export const YouTubeApp: React.FC<YouTubeAppProps> = ({ deviceId, isMini = false }) => {
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo>(CURATED_VIDEOS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isLiked, setIsLiked] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [userComment, setUserComment] = useState('');
  const [commentsList, setCommentsList] = useState(currentVideo.comments);

  const filteredVideos = CURATED_VIDEOS.filter((v) => {
    const matchesCategory = selectedCategory === 'All' || v.category === selectedCategory;
    const matchesSearch =
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.channel.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSelectVideo = (video: YouTubeVideo) => {
    setCurrentVideo(video);
    setCommentsList(video.comments);
    setIsLiked(false);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userComment.trim()) return;
    const newC = {
      user: deviceId ? `Device_${deviceId.replace('pixel-', 'P')}` : 'PixelUser',
      text: userComment.trim(),
      time: 'Just now',
      likes: '1',
    };
    setCommentsList([newC, ...commentsList]);
    setUserComment('');
  };

  return (
    <div className="w-full h-full bg-[#0f0f0f] text-white flex flex-col font-sans select-none overflow-hidden">
      {/* YouTube Top App Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f0f]/95 border-b border-zinc-800 shrink-0 z-20">
        <div className="flex items-center gap-1.5">
          {/* Official YouTube Logo */}
          <div className="w-6 h-4 bg-[#FF0000] rounded-md flex items-center justify-center shadow-sm">
            <Play className="w-2.5 h-2.5 text-white fill-white ml-0.5" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white flex items-center">
            YouTube
            <span className="text-[9px] font-mono text-zinc-400 ml-1 font-normal">ID</span>
          </span>
        </div>

        {/* Search Bar Input */}
        <div className="relative flex-1 max-w-[140px] mx-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-[#222222] text-xs text-white placeholder-zinc-500 rounded-full pl-7 pr-2 py-1 border border-zinc-700/60 focus:outline-none focus:border-red-500"
          />
          <Search className="w-3 h-3 text-zinc-400 absolute left-2 top-2" />
        </div>

        {/* User Profile Avatar */}
        <div className="w-6 h-6 rounded-full bg-red-600 border border-red-400 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
          P
        </div>
      </div>

      {/* Main Video Player Area */}
      <div className="relative w-full aspect-video bg-black shrink-0 border-b border-zinc-800">
        <iframe
          key={currentVideo.youtubeId}
          src={`https://www.youtube-nocookie.com/embed/${currentVideo.youtubeId}?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1`}
          title={currentVideo.title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {/* Floating badge over player */}
        <div className="absolute top-2 left-2 pointer-events-none">
          <span className="px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-sm text-[10px] font-semibold text-white border border-red-500/40 flex items-center gap-1 shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Live Video Stream
          </span>
        </div>
      </div>

      {/* Scrollable Content (Video Info, Actions, Next Videos) */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Video Metadata Header */}
        <div className="space-y-1.5">
          <h1 className="text-xs font-bold text-zinc-100 line-clamp-2 leading-snug">
            {currentVideo.title}
          </h1>
          <div className="flex items-center gap-2 text-[10px] text-zinc-400">
            <span>{currentVideo.views}</span>
            <span>•</span>
            <span>{currentVideo.uploadedTime}</span>
            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono text-[9px]">
              1080p60
            </span>
          </div>
        </div>

        {/* Channel Row & Subscribe */}
        <div className="flex items-center justify-between py-1 border-y border-zinc-800/80">
          <div className="flex items-center gap-2">
            <img
              src={currentVideo.channelAvatar}
              alt={currentVideo.channel}
              className="w-7 h-7 rounded-full object-cover border border-zinc-700"
            />
            <div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-zinc-200">{currentVideo.channel}</span>
                <CheckCircle className="w-3 h-3 text-zinc-400 fill-zinc-400/20" />
              </div>
              <span className="text-[10px] text-zinc-500">{currentVideo.subscribers} subscribers</span>
            </div>
          </div>

          <button
            onClick={() => setIsSubscribed(!isSubscribed)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              isSubscribed
                ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                : 'bg-white text-black hover:bg-zinc-200 shadow-md'
            }`}
          >
            {isSubscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>

        {/* Video Actions Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setIsLiked(!isLiked)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors shrink-0 ${
              isLiked
                ? 'bg-red-500/20 text-red-400 border-red-500/40'
                : 'bg-[#272727] text-zinc-200 border-zinc-700 hover:bg-[#333]'
            }`}
          >
            <ThumbsUp className={`w-3.5 h-3.5 ${isLiked ? 'fill-red-400' : ''}`} />
            <span>{isLiked ? 'Liked' : currentVideo.likes}</span>
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#272727] hover:bg-[#333] text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
            <span>Comments ({commentsList.length})</span>
          </button>

          <button
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(`https://youtube.com/watch?v=${currentVideo.youtubeId}`);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#272727] hover:bg-[#333] text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors shrink-0"
          >
            <Share2 className="w-3.5 h-3.5 text-zinc-400" />
            <span>Share</span>
          </button>
        </div>

        {/* Interactive Comments Drawer */}
        {showComments && (
          <div className="bg-[#1e1e1e] border border-zinc-700/80 rounded-xl p-2.5 space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
              <span className="text-[11px] font-bold text-zinc-200">
                Top Comments ({commentsList.length})
              </span>
              <button
                onClick={() => setShowComments(false)}
                className="text-[10px] text-zinc-400 hover:text-white"
              >
                Close ✕
              </button>
            </div>

            {/* Input Comment Box */}
            <form onSubmit={handleAddComment} className="flex gap-1.5">
              <input
                type="text"
                value={userComment}
                onChange={(e) => setUserComment(e.target.value)}
                placeholder="Add a comment on Pixel 7 Pro..."
                className="flex-1 bg-black/60 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold"
              >
                Post
              </button>
            </form>

            {/* Comments List */}
            <div className="space-y-2 max-h-36 overflow-y-auto pt-1">
              {commentsList.map((c, idx) => (
                <div key={idx} className="text-[11px] bg-black/40 p-2 rounded-lg border border-zinc-800">
                  <div className="flex items-center justify-between text-zinc-400 text-[10px] mb-0.5">
                    <span className="font-semibold text-zinc-300">@{c.user}</span>
                    <span>{c.time}</span>
                  </div>
                  <p className="text-zinc-200 text-[11px] leading-tight">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0 ${
                selectedCategory === cat
                  ? 'bg-white text-black font-semibold'
                  : 'bg-[#272727] text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Video Suggestions List (Up Next) */}
        <div className="space-y-2 pt-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
            Up Next • Trending Videos
          </span>
          {filteredVideos.map((video) => {
            const isPlaying = video.id === currentVideo.id;
            return (
              <div
                key={video.id}
                onClick={() => handleSelectVideo(video)}
                className={`flex gap-2.5 p-1.5 rounded-xl cursor-pointer transition-all border ${
                  isPlaying
                    ? 'bg-zinc-800/80 border-red-500/50 shadow-md shadow-red-950/20'
                    : 'bg-[#181818] border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-800/50'
                }`}
              >
                {/* Thumbnail */}
                <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-black shrink-0 border border-zinc-800">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 font-mono text-[9px] text-white font-bold">
                    {video.duration}
                  </div>
                  {isPlaying && (
                    <div className="absolute inset-0 bg-red-600/30 flex items-center justify-center">
                      <Play className="w-4 h-4 text-white fill-white animate-pulse" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <h4 className="text-xs font-semibold text-zinc-100 line-clamp-2 leading-tight">
                    {video.title}
                  </h4>
                  <div className="text-[10px] text-zinc-400">
                    <p className="truncate text-zinc-300 font-medium">{video.channel}</p>
                    <p>{video.views} • {video.uploadedTime}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
