import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { Upload, RefreshCw, Layers, Wand2, X, Download, RotateCcw, RotateCw, FlipHorizontal, FlipVertical, Check, Shield, Undo2, Trash2 } from 'lucide-react';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [resultImages, setResultImages] = useState<{ effect?: string; production?: string } | null>(null);
  const [activeLayer, setActiveLayer] = useState<'lineart' | 'reference'>('lineart');
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  const [history, setHistory] = useState<{ id: string, line: string, mask: string, timestamp: number }[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);

  // Undo History State
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);

  const CANVAS_SIZE = 2100;

  const saveCanvasState = (canvas: fabric.Canvas) => {
    const json = JSON.stringify(canvas.toObject(['id', 'selectable', 'evented', 'opacity']));
    let newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(json);
    if (newHistory.length > 11) { // 10 operations + 1 initial state
      newHistory = newHistory.slice(newHistory.length - 11);
    }
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    setCanUndo(historyIndexRef.current > 0);
  };

  const handleUndo = async () => {
    if (!fabricCanvas || historyIndexRef.current <= 0) return;
    
    const newIndex = historyIndexRef.current - 1;
    const previousState = historyRef.current[newIndex];
    
    await fabricCanvas.loadFromJSON(JSON.parse(previousState));
    fabricCanvas.requestRenderAll();
    
    historyIndexRef.current = newIndex;
    setCanUndo(newIndex > 0);
    
    // Re-select lineart if it exists
    const objects = fabricCanvas.getObjects();
    const lineart = objects.find(obj => (obj as any).id === 'lineart-layer');
    if (lineart) {
      fabricCanvas.setActiveObject(lineart);
      setSelectedObject(lineart);
    } else {
      fabricCanvas.discardActiveObject();
      setSelectedObject(null);
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Initialize Fabric Canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      preserveObjectStacking: true,
      backgroundColor: '#FFFFFF',
      targetFindTolerance: 40, // Larger tolerance for fingers
      allowTouchScrolling: false, // Prevent page scroll when touching canvas
      selection: false, // Disable group selection
    });
    
    // Global style for selected objects
    const updateSelectionStyle = (e: any) => {
      const obj = e.target;
      if (!obj) return;
      obj.set({
        borderColor: '#0066FF',
        borderScaleFactor: 10,
        cornerColor: '#0066FF',
        cornerStrokeColor: '#0066FF',
        cornerSize: 30,
        transparentCorners: false,
        cornerStyle: 'circle',
        padding: 10,
      });
      canvas.requestRenderAll();
    };

    canvas.on('selection:created', updateSelectionStyle);
    canvas.on('selection:updated', updateSelectionStyle);

    setFabricCanvas(canvas);

    // Multi-touch Gesture Handling
    let initialDistance = 0;
    let initialAngle = 0;
    let initialScaleX = 1;
    let initialScaleY = 1;
    let initialRotation = 0;

    (canvas as any).on('touch:gesture', (e: any) => {
      if (e.e.touches && e.e.touches.length === 2) {
        const target = canvas.getActiveObject();
        if (!target) return;

        const touch1 = e.e.touches[0];
        const touch2 = e.e.touches[1];
        
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        if (e.self.state === 'start') {
          initialDistance = distance;
          initialAngle = angle;
          initialScaleX = target.scaleX || 1;
          initialScaleY = target.scaleY || 1;
          initialRotation = target.angle || 0;
        } else if (e.self.state === 'move') {
          const scaleRatio = distance / initialDistance;
          const angleDiff = angle - initialAngle;

          target.set({
            scaleX: initialScaleX * scaleRatio,
            scaleY: initialScaleY * scaleRatio,
            angle: initialRotation + angleDiff
          });
          canvas.requestRenderAll();
        } else if (e.self.state === 'end') {
          saveCanvasState(canvas);
        }
      }
    });

    // Customize control handles (User Specified Style)
    const updateControls = () => {
      // Get actual display size of canvas
      const displayWidth = canvasRef.current?.clientWidth || 255;
      // Calculate scale factor between internal canvas size and display size
      const scaleFactor = displayWidth / CANVAS_SIZE;
      
      // Scale controls to maintain visible size at display level
      const cornerSize = 50 / scaleFactor;  // Will show as ~6px at 255px display
      const borderSize = 10 / scaleFactor;
      const padding = 15 / scaleFactor;

      fabric.Object.prototype.set({
        // Bounding Box
        borderColor: '#0066FF',
        borderScaleFactor: borderSize,
        borderOpacityWhenMoving: 1,
        
        // Control Points (8 points)
        transparentCorners: false,
        cornerColor: '#0066FF',
        cornerStrokeColor: '#0066FF',
        cornerSize: cornerSize,
        cornerStrokeWidth: 3 / scaleFactor,
        touchCornerSize: cornerSize,
        
        // Behavior & Style
        padding: padding,
        cornerStyle: 'circle',
        centeredScaling: false,
        centeredRotation: true,
        perPixelTargetFind: false,
        
        // Rotation handle
        hasRotatingPoint: true,
        rotatingPointOffset: 50 / scaleFactor,
      });
      
      // Force refresh if there's an active object
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        activeObject.setCoords();
        canvas.requestRenderAll();
      }
    };
    
    // Initial update
    updateControls();

    // Track selection
    canvas.on('selection:created', (e) => setSelectedObject(e.selected?.[0] || null));
    canvas.on('selection:updated', (e) => setSelectedObject(e.selected?.[0] || null));
    canvas.on('selection:cleared', () => setSelectedObject(null));

    // Track modifications for undo
    canvas.on('object:modified', () => saveCanvasState(canvas));

    // Re-run updateControls on window resize to maintain fixed visual size
    const handleResize = () => {
      const { width, height } = containerRef.current!.getBoundingClientRect();
      canvas.setDimensions({ width: `${width}px`, height: `${height}px` }, { cssOnly: true });
      updateControls();
    };
    
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    // Load Reference Layer
    fabric.FabricImage.fromURL('/A1.png', { crossOrigin: 'anonymous' }).then((img) => {
      img.set({
        id: 'reference-layer',
        selectable: false,
        evented: false,
        opacity: 0.4,
        originX: 'left',
        originY: 'top',
        left: 0,
        top: 0,
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        objectCaching: false,
      });
      canvas.add(img);
      canvas.sendObjectToBack(img);
      canvas.requestRenderAll();
      saveCanvasState(canvas);
    }).catch(err => {
      console.error('Failed to load reference image:', err);
      saveCanvasState(canvas);
    });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', checkMobile);
      canvas.dispose();
    };
  }, []);

  const cropTransparent = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(dataUrl);
        
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
        let hasPixels = false;
        
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const alpha = data[(y * canvas.width + x) * 4 + 3];
            if (alpha > 5) { // threshold
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              hasPixels = true;
            }
          }
        }
        
        if (!hasPixels) {
          resolve(dataUrl);
          return;
        }
        
        const padding = 2;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(canvas.width - 1, maxX + padding);
        maxY = Math.min(canvas.height - 1, maxY + padding);
        
        const croppedWidth = maxX - minX + 1;
        const croppedHeight = maxY - minY + 1;
        
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = croppedWidth;
        croppedCanvas.height = croppedHeight;
        const croppedCtx = croppedCanvas.getContext('2d');
        if (!croppedCtx) return resolve(dataUrl);
        
        croppedCtx.drawImage(
          canvas,
          minX, minY, croppedWidth, croppedHeight,
          0, 0, croppedWidth, croppedHeight
        );
        
        resolve(croppedCanvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  };

  const processAndAddImage = (file: File) => {
    if (!fabricCanvas) return;

    const reader = new FileReader();
    reader.onload = async (f) => {
      const data = f.target?.result as string;
      const croppedDataUrl = await cropTransparent(data);
      
      fabric.FabricImage.fromURL(croppedDataUrl).then((img) => {
        // Scale down if too large, but keep it high res
        const scale = Math.min(
          (CANVAS_SIZE * 0.8) / img.width!,
          (CANVAS_SIZE * 0.8) / img.height!
        );
        
        img.set({
          id: 'lineart-layer',
          left: CANVAS_SIZE / 2,
          top: CANVAS_SIZE / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale,
          objectCaching: false, // Disable caching for maximum sharpness during transform
        });
        
        fabricCanvas.add(img);
        fabricCanvas.bringObjectToFront(img); // Ensure it's on top
        fabricCanvas.setActiveObject(img);
        fabricCanvas.requestRenderAll();
        saveCanvasState(fabricCanvas);
      }).catch(err => {
        console.error('Failed to add image:', err);
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processAndAddImage(file);
    // Reset input
    e.target.value = '';
  };

  useEffect(() => {
    // Prevent browser's default behavior of opening dropped files globally
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processAndAddImage(file);
    }
  };

  const handleReset = () => {
    if (!fabricCanvas) return;
    const objects = fabricCanvas.getObjects();
    objects.forEach((obj) => {
      if ((obj as any).id !== 'reference-layer') {
        fabricCanvas.remove(obj);
      }
    });
    fabricCanvas.requestRenderAll();
    saveCanvasState(fabricCanvas);
  };

  const toggleReferenceLayer = () => {
    if (!fabricCanvas) return;
    const refLayer = fabricCanvas.getObjects().find(obj => (obj as any).id === 'reference-layer');
    if (refLayer) {
      const currentOpacity = refLayer.opacity;
      const newOpacity = currentOpacity > 0 ? 0 : 0.4;
      refLayer.set('opacity', newOpacity);
      fabricCanvas.requestRenderAll();
      setActiveLayer(newOpacity > 0 ? 'reference' : 'lineart');
    }
  };

  const handleRotateLeft = () => {
    if (!selectedObject || !fabricCanvas) return;
    selectedObject.rotate((selectedObject.angle || 0) - 90);
    fabricCanvas.requestRenderAll();
    saveCanvasState(fabricCanvas);
  };

  const handleRotateRight = () => {
    if (!selectedObject || !fabricCanvas) return;
    selectedObject.rotate((selectedObject.angle || 0) + 90);
    fabricCanvas.requestRenderAll();
    saveCanvasState(fabricCanvas);
  };

  const handleFlipHorizontal = () => {
    if (!selectedObject || !fabricCanvas) return;
    selectedObject.set('flipX', !selectedObject.flipX);
    fabricCanvas.requestRenderAll();
    saveCanvasState(fabricCanvas);
  };

  const handleFlipVertical = () => {
    if (!selectedObject || !fabricCanvas) return;
    selectedObject.set('flipY', !selectedObject.flipY);
    fabricCanvas.requestRenderAll();
    saveCanvasState(fabricCanvas);
  };

  const handleCancelSelection = () => {
    if (!fabricCanvas) return;
    fabricCanvas.discardActiveObject();
    fabricCanvas.requestRenderAll();
  };

  const handleDelete = () => {
    if (!selectedObject || !fabricCanvas) return;
    fabricCanvas.remove(selectedObject);
    fabricCanvas.discardActiveObject();
    fabricCanvas.requestRenderAll();
    saveCanvasState(fabricCanvas);
  };

  const generateImages = async () => {
    if (!fabricCanvas) return;
    
    setIsGenerating(true);
    setLoadingStep('正在读取线稿坐标...');

    try {
      // Create an in-memory Export Canvas
      const exportCanvas = new fabric.Canvas(null, {
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        preserveObjectStacking: true,
      });

      // Clone the lineart objects to the export canvas
      const lineartObjects = fabricCanvas.getObjects().filter(obj => (obj as any).id === 'lineart-layer');
      
      for (const obj of lineartObjects) {
        const clonedObj = await obj.clone();
        exportCanvas.add(clonedObj);
      }

      // 1. Prepare for 4.png (Synthesized Lineart)
      exportCanvas.set('backgroundColor', '#FFFFFF');
      exportCanvas.renderAll();
      
      // Export 4.png
      const img4DataUrl = exportCanvas.toDataURL({
        format: 'png',
        multiplier: 1,
        quality: 1
      });

      setLoadingStep('AI 引擎切割中...');
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate processing

      // 2. Prepare for 5.png (Character Mask)
      exportCanvas.set('backgroundColor', '#000000');
      
      // Apply ColorMatrix to make lineart pure white
      const filter = new fabric.filters.ColorMatrix({
        matrix: [
          0, 0, 0, 0, 255, // R
          0, 0, 0, 0, 255, // G
          0, 0, 0, 0, 255, // B
          0, 0, 0, 1, 0    // A
        ]
      });

      const exportObjects = exportCanvas.getObjects();
      for (const obj of exportObjects) {
        if (obj instanceof fabric.Image) {
          obj.filters = [filter];
          obj.applyFilters();
        }
      }
      
      exportCanvas.renderAll();
      
      // Export 5.png
      const img5DataUrl = exportCanvas.toDataURL({
        format: 'png',
        multiplier: 1,
        quality: 1
      });

      setLoadingStep('正在渲染高光质感...');
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call

      // Dispose the in-memory canvas
      exportCanvas.dispose();

      // Save to history
      setHistory(prev => [{
        id: Date.now().toString(),
        line: img4DataUrl,
        mask: img5DataUrl,
        timestamp: Date.now()
      }, ...prev]);

      // Mock result
      setResultImages({
        effect: 'https://picsum.photos/seed/acrylic-effect/800/800',
        production: 'https://picsum.photos/seed/acrylic-prod/800/800'
      });

    } catch (error) {
      console.error('Generation failed:', error);
      alert('生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-black text-white relative overflow-hidden font-sans"
      style={{
        backgroundImage: 'url(/background.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-[100] bg-accent-orange/10 backdrop-blur-sm border-4 border-dashed border-accent-orange flex items-center justify-center">
          <div className="text-2xl font-bold text-white tracking-wider flex items-center gap-4 bg-black/80 px-8 py-4 rounded-2xl border border-white/10">
            <Upload className="w-8 h-8 animate-bounce text-accent-orange" />
            松开鼠标，将图片添加到画布
          </div>
        </div>
      )}

      {/* Background decoration - subtle glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-orange/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-white/5 blur-[120px] rounded-full" />
      </div>

      {/* Main Layout - Floating Widgets Structure */}
      <div className="relative z-10 w-full h-screen flex items-center justify-center p-4 md:p-8">
        
        {/* Left Floating Toolbar */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-4 z-20">
          <div className="glass-card p-3 flex flex-col gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent-orange flex items-center justify-center shadow-lg shadow-accent-orange/20">
              <span className="font-bold text-white text-xl">A</span>
            </div>
            
            <div className="h-px bg-white/10 w-full" />

            <label className="w-12 h-12 rounded-xl flex items-center justify-center hover:bg-white/10 transition-all cursor-pointer group" title="上传图片">
              <Upload className="w-5 h-5 text-gray-400 group-hover:text-white" />
              <input type="file" accept="image/png" className="hidden" onChange={handleFileUpload} />
            </label>

            <button onClick={handleReset} className="w-12 h-12 rounded-xl flex items-center justify-center hover:bg-white/10 transition-all group" title="重置画布">
              <RefreshCw className="w-5 h-5 text-gray-400 group-hover:text-white" />
            </button>

            <button onClick={toggleReferenceLayer} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all border ${activeLayer === 'reference' ? 'bg-accent-orange/20 border-accent-orange/50 text-accent-orange' : 'hover:bg-white/10 border-transparent text-gray-400 hover:text-white'}`} title="切换参考层">
              <Layers className="w-5 h-5" />
            </button>
          </div>

          <button onClick={() => setShowAdmin(true)} className="glass-card w-18 h-18 flex items-center justify-center hover:bg-white/10 transition-all group" title="管理后台">
            <Shield className="w-6 h-6 text-gray-400 group-hover:text-accent-orange" />
          </button>
        </div>

        {/* Central Canvas Card */}
        <div className="tech-card w-full max-w-[900px] aspect-square relative overflow-hidden group">
          <div ref={containerRef} className="w-full h-full relative flex items-center justify-center bg-transparent">
            <canvas ref={canvasRef} />
          </div>

          {/* Canvas Overlay Info */}
          <div className="absolute top-6 left-6 pointer-events-none">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-accent-orange animate-pulse" />
              <span className="text-xs font-mono text-white/40 tracking-[0.2em] uppercase">System Active</span>
            </div>
          </div>

          {/* Floating Edit Toolbar */}
          {selectedObject && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-black/80 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl">
              <button onClick={handleUndo} disabled={!canUndo} className="p-2.5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all disabled:opacity-20" title="撤销">
                <Undo2 className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-white/10 mx-1" />
              <button onClick={handleRotateLeft} className="p-2.5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={handleRotateRight} className="p-2.5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all">
                <RotateCw className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-white/10 mx-1" />
              <button onClick={handleFlipHorizontal} className="p-2.5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all">
                <FlipHorizontal className="w-4 h-4" />
              </button>
              <button onClick={handleFlipVertical} className="p-2.5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all">
                <FlipVertical className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-white/10 mx-1" />
              <button onClick={handleDelete} className="p-2.5 hover:bg-red-500/20 rounded-xl text-red-400 hover:text-red-300 transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-white/10 mx-1" />
              <button onClick={handleCancelSelection} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white text-sm font-medium transition-all">
                完成
              </button>
            </div>
          )}
        </div>

        {/* Bottom Floating Action - Web Only */}
        <div className="absolute bottom-8 right-8 z-30 hidden lg:block">
          <button 
            onClick={generateImages}
            disabled={isGenerating}
            className="accent-button px-8 py-4 flex items-center gap-3 font-medium text-lg tracking-wide disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <Wand2 className="w-6 h-6 group-hover:rotate-12 transition-transform" />
            <span>一键生成</span>
          </button>
        </div>

        {/* Mobile Toolbar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 mobile-toolbar rounded-t-3xl p-4 flex items-center justify-around z-40">
          <label className="p-3 rounded-2xl hover:bg-white/10 transition-all cursor-pointer">
            <Upload className="w-6 h-6 text-gray-400" />
            <input type="file" accept="image/png" className="hidden" onChange={handleFileUpload} />
          </label>
          <button onClick={handleReset} className="p-3 rounded-2xl hover:bg-white/10 transition-all">
            <RefreshCw className="w-6 h-6 text-gray-400" />
          </button>
          <button onClick={generateImages} className="p-4 bg-accent-orange rounded-2xl shadow-lg shadow-accent-orange/20">
            <Wand2 className="w-6 h-6 text-white" />
          </button>
          <button onClick={toggleReferenceLayer} className={`p-3 rounded-2xl transition-all ${activeLayer === 'reference' ? 'text-accent-orange' : 'text-gray-400'}`}>
            <Layers className="w-6 h-6" />
          </button>
          <button onClick={() => setShowAdmin(true)} className="p-3 rounded-2xl hover:bg-white/10 transition-all">
            <Shield className="w-6 h-6 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Modals - Updated with Glass Style */}
      {isGenerating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl">
          <div className="glass-card p-10 w-[400px] flex flex-col items-center text-center border-accent-orange/20">
            <div className="w-20 h-20 mb-8 relative">
              <div className="absolute inset-0 border-2 border-white/5 rounded-full" />
              <div className="absolute inset-0 border-2 border-accent-orange rounded-full border-t-transparent animate-spin" />
              <Wand2 className="absolute inset-0 m-auto w-8 h-8 text-accent-orange animate-pulse" />
            </div>
            <h3 className="text-2xl font-medium mb-3">AI 核心处理中</h3>
            <p className="text-sm text-accent-orange/60 font-mono tracking-widest uppercase">{loadingStep}</p>
            <div className="w-full h-1 bg-white/5 rounded-full mt-8 overflow-hidden">
              <div className="h-full bg-accent-orange w-1/3 animate-[shimmer_2s_infinite]" />
            </div>
          </div>
        </div>
      )}

      {/* Result Modal */}
      {resultImages && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
          <div className="glass-card max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col border-white/10">
            <div className="flex justify-between items-center p-8 border-b border-white/5">
              <h2 className="text-2xl font-medium tracking-tight">生成结果 <span className="text-accent-orange ml-2 text-sm font-mono tracking-widest uppercase">Success</span></h2>
              <button onClick={() => setResultImages(null)} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-sm font-mono text-white/40 uppercase tracking-widest">Preview Render</h3>
                  <Download className="w-4 h-4 text-white/20" />
                </div>
                <div className="aspect-square rounded-3xl overflow-hidden bg-black/40 border border-white/5 shadow-inner">
                  <img src={resultImages.effect} alt="Effect Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <button className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all text-sm font-medium border border-white/5">
                  下载预览图
                </button>
              </div>
              
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-sm font-mono text-accent-orange uppercase tracking-widest">Production Layout</h3>
                  <Download className="w-4 h-4 text-accent-orange/40" />
                </div>
                <div className="aspect-square rounded-3xl overflow-hidden bg-black/40 border border-accent-orange/10 shadow-inner">
                  <img src={resultImages.production} alt="Production Layout" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <button className="w-full py-4 rounded-2xl bg-accent-orange/10 hover:bg-accent-orange/20 text-accent-orange transition-all text-sm font-medium border border-accent-orange/20">
                  下载生产图
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Modal */}
      {showAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
          <div className="glass-card max-w-6xl w-full h-[90vh] flex flex-col border-white/10">
            <div className="flex justify-between items-center p-8 border-b border-white/5">
              <h2 className="text-2xl font-medium tracking-tight flex items-center gap-4">
                <Shield className="w-7 h-7 text-accent-orange" />
                管理者模式 <span className="text-white/20 text-sm font-mono">/ History</span>
              </h2>
              <button onClick={() => setShowAdmin(false)} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/20 gap-4">
                  <Layers className="w-12 h-12 opacity-10" />
                  <span className="text-sm font-mono uppercase tracking-widest">No Records Found</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-10">
                  {history.map((item, index) => (
                    <div key={item.id} className="tech-card p-8 flex flex-col gap-8">
                      <div className="flex items-center justify-between border-b border-white/5 pb-6">
                        <div className="flex items-center gap-4">
                          <span className="w-10 h-10 rounded-xl bg-accent-orange/10 flex items-center justify-center text-accent-orange font-mono text-sm">
                            {history.length - index}
                          </span>
                          <span className="text-lg font-medium">Task Sequence</span>
                        </div>
                        <span className="text-xs text-white/30 font-mono tracking-wider">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em]">Line Art Composite</span>
                            <button onClick={() => {
                              const a = document.createElement('a');
                              a.href = item.line;
                              a.download = `LINE_${item.id}.png`;
                              a.click();
                            }} className="text-[10px] text-accent-orange hover:underline uppercase tracking-widest">Download</button>
                          </div>
                          <div className="aspect-square rounded-2xl overflow-hidden bg-white border border-white/10">
                            <img src={item.line} alt="LINE" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em]">Character Mask</span>
                            <button onClick={() => {
                              const a = document.createElement('a');
                              a.href = item.mask;
                              a.download = `MASK_${item.id}.png`;
                              a.click();
                            }} className="text-[10px] text-accent-orange hover:underline uppercase tracking-widest">Download</button>
                          </div>
                          <div className="aspect-square rounded-2xl overflow-hidden bg-black border border-white/10">
                            <img src={item.mask} alt="MASK" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
