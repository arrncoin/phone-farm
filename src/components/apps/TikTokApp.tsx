import React, { useState, useRef, useEffect } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Music2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Plus,
  Check,
  ChevronUp,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

interface TikTokVideo {
  id: string;
  creator: string;
  creatorHandle: string;
  avatar: string;
  description: string;
  hashtags: string[];
  soundTitle: string;
  likes: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  videoUrl: string;
  posterUrl: string;
  comments: { user: string; text: string; time: string; likes: number }[];
}

const TIKTOK_FEED: TikTokVideo[] = [
  {
    id: 'tt-1',
    creator: 'PixelTech Lab',
    creatorHandle: '@pixeltech_lab',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
    description: 'Unboxing 10 Google Pixel 7 Pro devices for automated phone farm testing! 📱🚀 Tensor G2 speed is insane.',
    hashtags: ['#pixel7pro', '#androidfarm', '#techtok', '#google', '#automation'],
    soundTitle: 'original sound - PixelTech Official Audio',
    likes: 142800,
    commentsCount: 3820,
    sharesCount: 1450,
    savesCount: 9200,
    // Reliable high-quality vertical web video
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-vertical-view-of-a-neon-cyberpunk-city-at-night-42358-large.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=640&auto=format&fit=crop&q=80',
    comments: [
      { user: 'devops_ninja', text: '10 devices running concurrently on one dashboard? That is clean!', time: '2h ago', likes: 450 },
      { user: 'cheetah_fan', text: 'Pixel 7 Pro Hazel color is peak industrial design 🔥', time: '5h ago', likes: 180 },
      { user: 'docker_master', text: 'How is the RAM usage per container?', time: '1d ago', likes: 92 },
    ],
  },
  {
    id: 'tt-2',
    creator: 'Future Robotics',
    creatorHandle: '@futurerobotics',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80',
    description: 'AI Autonomous bipedal robot walking through Tokyo streets in rain 🤖🌧️ The balance algorithm is next level.',
    hashtags: ['#ai', '#robotics', '#tokyo', '#tech', '#future', '#fyp'],
    soundTitle: 'Cyberpunk 2077 Vibe Beat - Synthwave Lab',
    likes: 389200,
    commentsCount: 12400,
    sharesCount: 4520,
    savesCount: 28900,
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-typing-on-a-laptop-keyboard-in-a-dark-room-43187-large.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=640&auto=format&fit=crop&q=80',
    comments: [
      { user: 'sarah_tech', text: 'We really living in the future now wow 🤯', time: '1h ago', likes: 1200 },
      { user: 'coder_ken', text: 'Look at that real-time stabilization sensor working!', time: '3h ago', likes: 310 },
    ],
  },
  {
    id: 'tt-3',
    creator: 'SpeedBench Mobile',
    creatorHandle: '@speedbench',
    avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100&auto=format&fit=crop&q=80',
    description: 'Tensor G2 vs Snapdragon 8 Gen 2 stress test at 100% CPU load across 10 virtual instances! ⚡🔥',
    hashtags: ['#benchmark', '#geekbench', '#pixel7pro', '#android', '#gaming'],
    soundTitle: 'Phonk Beat Extreme - Drift Drift',
    likes: 89400,
    commentsCount: 2150,
    sharesCount: 880,
    savesCount: 4600,
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-circuit-board-microchip-in-close-up-42777-large.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=640&auto=format&fit=crop&q=80',
    comments: [
      { user: 'hardware_nerd', text: 'The TPU in Tensor G2 is what makes speech and voice recognition fly.', time: '4h ago', likes: 210 },
      { user: 'mobile_pro', text: 'Very impressive thermal efficiency.', time: '8h ago', likes: 64 },
    ],
  },
  {
    id: 'tt-4',
    creator: 'Lofi Aesthetic',
    creatorHandle: '@lofiaesthetic',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
    description: 'Rainy coffee shop coding vibe on Pixel 7 Pro with Termux + Neovim ✨☕ Who else codes on mobile?',
    hashtags: ['#lofi', '#coding', '#developer', '#aesthetic', '#vibes'],
    soundTitle: 'Cozy Rain & Piano - Chilled Cow',
    likes: 541000,
    commentsCount: 16700,
    sharesCount: 9400,
    savesCount: 42100,
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-coffee-cup-next-to-a-laptop-in-a-cafe-43186-large.mp4',
    posterUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=640&auto=format&fit=crop&q=80',
    comments: [
      { user: 'termux_user', text: 'Termux + tmux + nvim is actually my daily driver on Android!', time: '30m ago', likes: 890 },
      { user: 'vibe_check', text: 'This aesthetic is everything 🌧️', time: '2h ago', likes: 320 },
    ],
  },
];

interface TikTokAppProps {
  deviceId?: string;
  isMini?: boolean;
}

export const TikTokApp: React.FC<TikTokAppProps> = ({ deviceId, isMini = false }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const [followedMap, setFollowedMap] = useState<Record<string, boolean>>({});
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentsState, setCommentsState] = useState(TIKTOK_FEED[0].comments);
  const [activeTab, setActiveTab] = useState<'fyp' | 'following'>('fyp');
  const [showHeartAnim, setShowHeartAnim] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const currentVideo = TIKTOK_FEED[currentIndex];
  const isCurrentLiked = !!likedMap[currentVideo.id];
  const isCurrentSaved = !!savedMap[currentVideo.id];
  const isCurrentFollowed = !!followedMap[currentVideo.creatorHandle];

  // Sync comments on video change
  useEffect(() => {
    setCommentsState(currentVideo.comments);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [currentIndex, currentVideo]);

  const handleNextVideo = () => {
    if (currentIndex < TIKTOK_FEED.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0); // loop
    }
  };

  const handlePrevVideo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      setCurrentIndex(TIKTOK_FEED.length - 1);
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const toggleLike = () => {
    setLikedMap((prev) => ({
      ...prev,
      [currentVideo.id]: !prev[currentVideo.id],
    }));
    if (!isCurrentLiked) {
      setShowHeartAnim(true);
      setTimeout(() => setShowHeartAnim(false), 800);
    }
  };

  const toggleSave = () => {
    setSavedMap((prev) => ({
      ...prev,
      [currentVideo.id]: !prev[currentVideo.id],
    }));
  };

  const toggleFollow = () => {
    setFollowedMap((prev) => ({
      ...prev,
      [currentVideo.creatorHandle]: !prev[currentVideo.creatorHandle],
    }));
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const newComment = {
      user: deviceId ? `Device_${deviceId.replace('pixel-', 'P')}` : 'TikTokUser',
      text: commentText.trim(),
      time: 'Just now',
      likes: 1,
    };
    setCommentsState([newComment, ...commentsState]);
    setCommentText('');
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
  };

  return (
    <div className="relative w-full h-full bg-black text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Background Video Player (Vertical Full Screen) */}
      <div
        onClick={togglePlayPause}
        className="absolute inset-0 z-0 bg-black flex items-center justify-center cursor-pointer"
      >
        <video
          ref={videoRef}
          src={currentVideo.videoUrl}
          poster={currentVideo.posterUrl}
          loop
          muted={isMuted}
          playsInline
          autoPlay
          className="w-full h-full object-cover"
        />

        {/* Play/Pause Overlay indicator when paused */}
        {!isPlaying && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm border border-white/30 flex items-center justify-center">
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            </div>
          </div>
        )}

        {/* Heart Burst Animation on Like */}
        {showHeartAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-ping">
            <Heart className="w-24 h-24 text-rose-500 fill-rose-500" />
          </div>
        )}

        {/* Bottom subtle gradient for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
        {/* Top subtle gradient for top bar */}
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none" />
      </div>

      {/* Top Header Bar: LIVE, Following, For You, Audio Toggle */}
      <div className="relative z-10 flex items-center justify-between px-3 pt-2 pb-1">
        {/* Live Badge */}
        <button className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600/80 backdrop-blur-sm text-[10px] font-bold tracking-wider text-white border border-red-400/40">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </button>

        {/* Tabs: Following & For You */}
        <div className="flex items-center gap-4 text-xs font-bold">
          <button
            onClick={() => setActiveTab('following')}
            className={`transition-colors relative py-1 ${
              activeTab === 'following' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Following
            {activeTab === 'following' && (
              <span className="absolute bottom-0 inset-x-1 h-0.5 bg-white rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('fyp')}
            className={`transition-colors relative py-1 ${
              activeTab === 'fyp' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            For You
            {activeTab === 'fyp' && (
              <span className="absolute bottom-0 inset-x-1 h-0.5 bg-white rounded-full" />
            )}
          </button>
        </div>

        {/* Sound Toggle (Mute / Unmute) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMuted(!isMuted);
          }}
          className="p-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-black/90 transition-colors"
          title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-zinc-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
        </button>
      </div>

      {/* Video Navigation Arrows (Quick Next / Prev) */}
      <div className="absolute right-2 top-14 z-10 flex flex-col gap-1">
        <button
          onClick={handlePrevVideo}
          className="p-1 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300 hover:text-white border border-white/10"
          title="Previous Video (Swipe Down)"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={handleNextVideo}
          className="p-1 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300 hover:text-white border border-white/10"
          title="Next Video (Swipe Up)"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Right Side Action Bar (Avatar, Heart, Comment, Save, Share, Spinning Disc) */}
      <div className="absolute right-2 bottom-16 z-20 flex flex-col items-center gap-3">
        {/* Creator Avatar with Follow Button */}
        <div className="relative mb-1">
          <img
            src={currentVideo.avatar}
            alt={currentVideo.creator}
            className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-lg"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFollow();
            }}
            className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow ${
              isCurrentFollowed ? 'bg-zinc-700' : 'bg-[#FE2C55]'
            }`}
          >
            {isCurrentFollowed ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
          </button>
        </div>

        {/* Like Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleLike();
          }}
          className="flex flex-col items-center group"
        >
          <div className="p-2 rounded-full bg-black/40 backdrop-blur-sm text-white group-hover:scale-110 transition-transform">
            <Heart
              className={`w-6 h-6 ${
                isCurrentLiked
                  ? 'text-[#FE2C55] fill-[#FE2C55]'
                  : 'text-white'
              }`}
            />
          </div>
          <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow">
            {formatNumber(currentVideo.likes + (isCurrentLiked ? 1 : 0))}
          </span>
        </button>

        {/* Comment Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowComments(!showComments);
          }}
          className="flex flex-col items-center group"
        >
          <div className="p-2 rounded-full bg-black/40 backdrop-blur-sm text-white group-hover:scale-110 transition-transform">
            <MessageCircle className="w-6 h-6 text-white fill-white/10" />
          </div>
          <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow">
            {formatNumber(commentsState.length)}
          </span>
        </button>

        {/* Save / Bookmark Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSave();
          }}
          className="flex flex-col items-center group"
        >
          <div className="p-2 rounded-full bg-black/40 backdrop-blur-sm text-white group-hover:scale-110 transition-transform">
            <Bookmark
              className={`w-5 h-5 ${
                isCurrentSaved ? 'text-amber-400 fill-amber-400' : 'text-white'
              }`}
            />
          </div>
          <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow">
            {formatNumber(currentVideo.savesCount + (isCurrentSaved ? 1 : 0))}
          </span>
        </button>

        {/* Share Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (navigator.clipboard) {
              navigator.clipboard.writeText(`https://tiktok.com/@${currentVideo.creatorHandle}/video/${currentVideo.id}`);
            }
          }}
          className="flex flex-col items-center group"
        >
          <div className="p-2 rounded-full bg-black/40 backdrop-blur-sm text-white group-hover:scale-110 transition-transform">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow">
            {formatNumber(currentVideo.sharesCount)}
          </span>
        </button>

        {/* Spinning Vinyl Record Disc */}
        <div className="w-9 h-9 rounded-full bg-zinc-900 border-2 border-zinc-700 flex items-center justify-center animate-spin duration-3000 shadow-xl overflow-hidden mt-1">
          <img
            src={currentVideo.avatar}
            alt="sound"
            className="w-5 h-5 rounded-full object-cover"
          />
        </div>
      </div>

      {/* Bottom Info Section: Username, Description, Sound Ticker */}
      <div className="absolute left-3 right-16 bottom-14 z-20 space-y-1.5 pointer-events-none">
        {/* Creator Name */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <span className="font-bold text-xs text-white drop-shadow">
            {currentVideo.creatorHandle}
          </span>
          <span className="px-1 py-0.2 rounded bg-black/50 text-[9px] font-mono text-cyan-300 border border-cyan-400/30">
            TikTok
          </span>
        </div>

        {/* Description & Hashtags */}
        <p className="text-xs text-zinc-100 drop-shadow line-clamp-2 leading-relaxed">
          {currentVideo.description}{' '}
          {currentVideo.hashtags.map((tag) => (
            <span key={tag} className="font-bold text-white mr-1 drop-shadow">
              {tag}
            </span>
          ))}
        </p>

        {/* Audio Track Ticker */}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-300 drop-shadow">
          <Music2 className="w-3 h-3 text-white shrink-0 animate-bounce" />
          <div className="overflow-hidden whitespace-nowrap">
            <span className="inline-block animate-marquee">{currentVideo.soundTitle}</span>
          </div>
        </div>
      </div>

      {/* Interactive Comments Modal / Bottom Sheet */}
      {showComments && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 top-32 z-30 bg-zinc-950/95 backdrop-blur-md rounded-t-2xl border-t border-zinc-800 p-3 flex flex-col animate-in slide-in-from-bottom duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
            <span className="text-xs font-bold text-zinc-200">
              {commentsState.length} comments
            </span>
            <button
              onClick={() => setShowComments(false)}
              className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              ✕
            </button>
          </div>

          {/* Comments List */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {commentsState.map((c, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <div className="w-7 h-7 rounded-full bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center font-bold text-[10px] text-cyan-300 shrink-0">
                  {c.user.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span className="font-semibold text-zinc-300">@{c.user}</span>
                    <span>{c.time}</span>
                  </div>
                  <p className="text-zinc-200 text-xs mt-0.5">{c.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Comment Form */}
          <form onSubmit={handleAddComment} className="mt-2 pt-2 border-t border-zinc-800 flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add comment on Pixel 7 Pro..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-[#FE2C55] hover:bg-[#e0264b] text-white rounded-full text-xs font-bold"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* TikTok Bottom Navigation Bar */}
      <div className="relative z-20 flex items-center justify-around py-1.5 bg-black/90 border-t border-zinc-900 text-[10px] text-zinc-400 mt-auto">
        <button className="flex flex-col items-center text-white font-bold">
          <span>Home</span>
          <span className="w-1 h-1 rounded-full bg-white mt-0.5" />
        </button>
        <button className="flex flex-col items-center hover:text-white">
          <span>Friends</span>
        </button>

        {/* Plus Create Video Button */}
        <button className="relative px-3 py-1 flex items-center justify-center">
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-400 to-[#FE2C55]" />
          <div className="relative bg-white text-black font-bold px-2.5 py-0.5 rounded-md text-xs">
            +
          </div>
        </button>

        <button className="flex flex-col items-center hover:text-white">
          <span>Inbox</span>
        </button>
        <button className="flex flex-col items-center hover:text-white">
          <span>Profile</span>
        </button>
      </div>
    </div>
  );
};
