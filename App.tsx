
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Download, Sliders, Zap, Image as ImageIcon, RotateCcw, Monitor, Info, Palette, Video, Film, Loader2 } from 'lucide-react';
import { DitherMode, FilterSettings, MediaState, SourceType } from './types';
import { processImage, applyFiltersToCanvas } from './utils/imageFilters';
import { analyzeImageStyle } from './services/geminiService';

const DEFAULT_SETTINGS: FilterSettings = {
  pixelSize: 4,
  contrast: 40,
  brightness: 0,
  threshold: 128,
  mode: DitherMode.BAYER,
  invert: false,
  dotScale: 1.2,
  colorA: '#000000',
  colorB: '#FFFFFF'
};

const PRESETS = [
  { name: 'Mono', a: '#000000', b: '#FFFFFF' },
  { name: 'GameBoy', a: '#0f380f', b: '#8bac0f' },
  { name: 'Amber', a: '#1a1000', b: '#ffb000' },
  { name: 'Cyber', a: '#2b0035', b: '#00fff2' },
  { name: 'Slate', a: '#1e293b', b: '#f1f5f9' },
];

const ColorInput = ({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) => (
  <div className="space-y-2">
    <label className="text-[10px] text-zinc-600 uppercase">{label}</label>
    <div className="flex items-center gap-2 bg-zinc-900 p-2 rounded border border-zinc-800">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-6 h-6 bg-transparent border-none cursor-pointer" />
      <span className="text-[10px] uppercase">{value}</span>
    </div>
  </div>
);

const ControlGroup = ({ label, value, unit, children }: { label: string, value: string | number, unit?: string, children?: React.ReactNode }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center text-[10px]">
      <label className="text-zinc-500 uppercase font-bold tracking-wider">{label}</label>
      <span className="text-white font-bold">{value}{unit}</span>
    </div>
    {children}
  </div>
);

const App: React.FC = () => {
  const [settings, setSettings] = useState<FilterSettings>(DEFAULT_SETTINGS);
  const [mediaState, setMediaState] = useState<MediaState>({
    sourceType: null,
    originalUrl: null,
    processedUrl: null,
    isLoading: false,
    isExporting: false,
    exportProgress: 0
  });
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const requestRef = useRef<number>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 清理舊的 URL 避免內存洩漏
    if (mediaState.originalUrl) {
      URL.revokeObjectURL(mediaState.originalUrl);
    }

    const isVideo = file.type.startsWith('video/');
    const url = URL.createObjectURL(file);

    setIsVideoReady(false);

    if (isVideo) {
      setMediaState({
        sourceType: 'video',
        originalUrl: url,
        processedUrl: null,
        isLoading: false,
        isExporting: false,
        exportProgress: 0
      });
    } else {
      const img = new Image();
      img.onload = () => {
        originalImageRef.current = img;
        setMediaState({
          sourceType: 'image',
          originalUrl: url,
          processedUrl: null,
          isLoading: false,
          isExporting: false,
          exportProgress: 0
        });
        triggerImageProcessing(img, settings);
      };
      img.src = url;
    }
  };

  const triggerImageProcessing = useCallback(async (img: HTMLImageElement, currentSettings: FilterSettings) => {
    setMediaState(prev => ({ ...prev, isLoading: true }));
    try {
      const result = await processImage(img, currentSettings);
      setMediaState(prev => ({ ...prev, processedUrl: result, isLoading: false }));
    } catch (err) {
      console.error(err);
      setMediaState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Video Preview Loop - 增加對 videoWidth 的檢查確保數據有效
  const updateVideoFrame = useCallback(() => {
    if (videoRef.current && canvasRef.current && mediaState.sourceType === 'video' && isVideoReady) {
      const video = videoRef.current;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        applyFiltersToCanvas(
          video,
          video.videoWidth,
          video.videoHeight,
          settings,
          canvasRef.current
        );
      }
    }
    requestRef.current = requestAnimationFrame(updateVideoFrame);
  }, [settings, mediaState.sourceType, isVideoReady]);

  useEffect(() => {
    if (mediaState.sourceType === 'video' && isVideoReady) {
      requestRef.current = requestAnimationFrame(updateVideoFrame);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [mediaState.sourceType, isVideoReady, updateVideoFrame]);

  useEffect(() => {
    if (originalImageRef.current && mediaState.sourceType === 'image') {
      const timeout = setTimeout(() => {
        triggerImageProcessing(originalImageRef.current!, settings);
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [settings, triggerImageProcessing, mediaState.sourceType]);

  const runAiAnalysis = async () => {
    if (!mediaState.originalUrl) return;
    setIsAiProcessing(true);
    
    let sourceData: string | null = null;
    if (mediaState.sourceType === 'video' && canvasRef.current) {
      sourceData = canvasRef.current.toDataURL('image/png');
    } else if (originalImageRef.current) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = originalImageRef.current.width;
      tempCanvas.height = originalImageRef.current.height;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(originalImageRef.current, 0, 0);
        sourceData = tempCanvas.toDataURL('image/png');
      }
    }

    if (sourceData) {
      const suggested = await analyzeImageStyle(sourceData);
      if (suggested) {
        setSettings(prev => ({ ...prev, ...suggested }));
      }
    }
    setIsAiProcessing(false);
  };

  const exportMedia = async () => {
    if (mediaState.sourceType === 'image') {
      if (!mediaState.processedUrl) return;
      const link = document.createElement('a');
      link.download = `pixelart-image-${Date.now()}.png`;
      link.href = mediaState.processedUrl;
      link.click();
    } else if (mediaState.sourceType === 'video' && videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      setMediaState(prev => ({ ...prev, isExporting: true, exportProgress: 0 }));
      
      // 嘗試不同的 mimeType 提高相容性
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
        ? 'video/webm;codecs=vp9' 
        : 'video/webm';
        
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `pixelart-video-${Date.now()}.webm`;
        link.href = url;
        link.click();
        setMediaState(prev => ({ ...prev, isExporting: false, exportProgress: 0 }));
      };

      video.pause();
      video.currentTime = 0;
      
      const onEnded = () => {
        recorder.stop();
        video.removeEventListener('ended', onEnded);
      };
      video.addEventListener('ended', onEnded);

      recorder.start();
      video.play();

      const progressInterval = setInterval(() => {
        if (!video.duration) return;
        const progress = Math.min(100, Math.floor((video.currentTime / video.duration) * 100));
        setMediaState(prev => ({ ...prev, exportProgress: progress }));
        if (video.ended) clearInterval(progressInterval);
      }, 500);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-200 flex flex-col md:flex-row font-mono">
      <aside className="w-full md:w-80 bg-[#111] border-r border-white/10 p-6 flex flex-col gap-8 overflow-y-auto max-h-screen z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
            <ImageIcon className="w-6 h-6" /> PIXELART.OS
          </h1>
          <button onClick={() => setShowInfo(!showInfo)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <Info className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <div className="space-y-6">
          <section>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-zinc-800 hover:border-zinc-500 transition-all rounded-lg group"
            >
              <Upload className="w-4 h-4 group-hover:-translate-y-1 transition-transform" />
              <span>UPLOAD MEDIA</span>
            </button>
            <p className="text-[9px] text-zinc-600 mt-2 text-center">SUPPORTED: JPG, PNG, MP4</p>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-zinc-500">
              <Palette className="w-3 h-3" /> Color Palette
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <ColorInput label="Background" value={settings.colorA} onChange={val => setSettings(s => ({ ...s, colorA: val }))} />
              <ColorInput label="Foreground" value={settings.colorB} onChange={val => setSettings(s => ({ ...s, colorB: val }))} />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {PRESETS.map(p => (
                <button key={p.name} onClick={() => setSettings(s => ({ ...s, colorA: p.a, colorB: p.b }))} className="group flex flex-col items-center gap-1">
                  <div className="flex w-8 h-4 rounded overflow-hidden border border-zinc-700 group-hover:border-white transition-colors">
                    <div className="flex-1" style={{ backgroundColor: p.a }} />
                    <div className="flex-1" style={{ backgroundColor: p.b }} />
                  </div>
                  <span className="text-[8px] text-zinc-600 group-hover:text-zinc-400">{p.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-zinc-500">
              <Sliders className="w-3 h-3" /> Parameters
            </div>

            <div className="space-y-4">
              <ControlGroup label="Pixel Size" value={settings.pixelSize} unit="px">
                <input type="range" min="1" max="24" step="1" value={settings.pixelSize} onChange={(e) => setSettings(s => ({ ...s, pixelSize: parseInt(e.target.value) }))} className="w-full accent-white" />
              </ControlGroup>
              <ControlGroup label="Contrast" value={settings.contrast}>
                <input type="range" min="-100" max="100" step="1" value={settings.contrast} onChange={(e) => setSettings(s => ({ ...s, contrast: parseInt(e.target.value) }))} className="w-full accent-white" />
              </ControlGroup>
              <ControlGroup label="Threshold" value={settings.threshold}>
                <input type="range" min="0" max="255" step="1" value={settings.threshold} onChange={(e) => setSettings(s => ({ ...s, threshold: parseInt(e.target.value) }))} className="w-full accent-white" />
              </ControlGroup>

              <div className="space-y-2">
                <label className="text-xs text-zinc-500 uppercase">Dither Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(DitherMode).map(mode => (
                    <button key={mode} onClick={() => setSettings(s => ({ ...s, mode }))} className={`py-2 text-[10px] border transition-all ${settings.mode === mode ? 'bg-white text-black border-white' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}>{mode}</button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="text-xs text-zinc-500 uppercase">Swap Colors</label>
                <button onClick={() => setSettings(s => ({ ...s, invert: !s.invert }))} className={`w-12 h-6 rounded-full transition-colors relative ${settings.invert ? 'bg-indigo-600' : 'bg-zinc-800'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${settings.invert ? 'right-1 bg-white' : 'left-1 bg-zinc-500'}`} />
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-3 pt-4 border-t border-white/5">
            <button onClick={runAiAnalysis} disabled={!mediaState.originalUrl || isAiProcessing} className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg transition-all ${isAiProcessing ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}>
              <Zap className={`w-4 h-4 ${isAiProcessing ? 'animate-pulse' : ''}`} />
              <span>{isAiProcessing ? 'AI TUNING...' : 'AI AUTO-TUNE'}</span>
            </button>
            <button onClick={() => setSettings(DEFAULT_SETTINGS)} className="w-full py-2 text-xs text-zinc-500 hover:text-white flex items-center justify-center gap-2 transition-colors">
              <RotateCcw className="w-3 h-3" /> RESET ALL
            </button>
          </section>
        </div>
      </aside>

      <main className="flex-1 flex flex-col p-4 md:p-10 relative overflow-hidden">
        <div className="flex-1 flex items-center justify-center relative bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:20px_20px] rounded-2xl border border-white/5 overflow-hidden">
          {!mediaState.originalUrl && (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 border-2 border-dashed border-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6 text-zinc-700">
                <ImageIcon className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold tracking-tighter text-zinc-400 uppercase">Input Required</h2>
            </div>
          )}

          {mediaState.sourceType === 'video' && mediaState.originalUrl && (
            <video 
              key={mediaState.originalUrl}
              ref={videoRef} 
              src={mediaState.originalUrl} 
              className="hidden" 
              loop 
              muted 
              playsInline 
              onPlaying={() => setIsVideoReady(true)}
              onLoadedData={(e) => {
                const video = e.currentTarget;
                video.play().catch(console.error);
              }}
            />
          )}

          <canvas 
            ref={canvasRef} 
            className={`max-h-[80vh] max-w-full object-contain shadow-2xl transition-opacity duration-200 ${mediaState.isLoading || (mediaState.sourceType === 'video' && !isVideoReady) ? 'opacity-50' : 'opacity-100'} ${mediaState.sourceType === 'image' ? 'hidden' : 'block'}`}
            style={{ imageRendering: 'pixelated' }}
          />

          {mediaState.sourceType === 'image' && mediaState.processedUrl && (
            <img src={mediaState.processedUrl} alt="Processed" className={`max-h-[80vh] max-w-full object-contain shadow-2xl ${mediaState.isLoading ? 'opacity-50' : 'opacity-100'}`} style={{ imageRendering: 'pixelated' }} />
          )}

          {(mediaState.isLoading || (mediaState.sourceType === 'video' && !isVideoReady)) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            </div>
          )}

          {mediaState.isExporting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-50">
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
              <h3 className="text-lg font-bold tracking-widest uppercase mb-2">Exporting Video</h3>
              <div className="w-64 h-2 bg-zinc-800 rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${mediaState.exportProgress}%` }} />
              </div>
              <span className="text-[10px] mt-2 text-zinc-500">{mediaState.exportProgress}% COMPLETE</span>
            </div>
          )}
        </div>

        {mediaState.originalUrl && (
          <div className="h-20 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-xl mt-6 rounded-xl border border-white/10">
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest flex items-center gap-1">
                {mediaState.sourceType === 'video' ? <Film className="w-3 h-3"/> : <ImageIcon className="w-3 h-3"/>}
                {mediaState.sourceType === 'video' ? 'VIDEO READY' : 'IMAGE READY'}
              </span>
              <span className="text-sm font-bold">
                {mediaState.sourceType === 'image' ? (originalImageRef.current?.width || 0) : (videoRef.current?.videoWidth || 0)} × {mediaState.sourceType === 'image' ? (originalImageRef.current?.height || 0) : (videoRef.current?.videoHeight || 0)}
              </span>
            </div>
            
            <button 
              onClick={exportMedia}
              disabled={mediaState.isExporting || (mediaState.sourceType === 'video' && !isVideoReady)}
              className="flex items-center gap-3 bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-zinc-200 transition-all shadow-xl active:scale-95 disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              {mediaState.sourceType === 'video' ? 'EXPORT WEBM' : 'EXPORT PNG'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
