import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { Upload, RefreshCw, Layers, Wand2, X, Download, RotateCcw, RotateCw, FlipHorizontal, FlipVertical, Check, Shield, Undo2, Trash2, Settings } from 'lucide-react';

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
        borderScaleFactor: 3,
        borderColor: '#FF6A00',
        cornerColor: '#FF6A00',
        cornerStrokeColor: '#FFFFFF',
        cornerSize: 16,
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

  // 轮询定时器 Ref
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 清理轮询定时器
  const clearPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, []);

  // 图片压缩函数 - 保持 2100x2100，仅压缩质量
  const compressImage = (dataUrl: string, maxSize: number = 2100, quality: number = 0.9): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // 限制最大尺寸（保持 2100x2100）
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height / width) * maxSize);
            width = maxSize;
          } else {
            width = Math.round((width / height) * maxSize);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // 使用平滑绘制
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // 递归尝试不同质量直到文件小于 500KB
        const tryCompress = (q: number): void => {
          canvas.toBlob((blob) => {
            if (blob) {
              if (blob.size > 500 * 1024 && q > 0.3) {
                // 如果还是太大，降低质量重试
                tryCompress(q - 0.1);
              } else {
                resolve(canvas.toDataURL('image/jpeg', q));
              }
            } else {
              resolve(canvas.toDataURL('image/jpeg', 0.9));
            }
          }, 'image/jpeg', q);
        };

        tryCompress(quality);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  };

  // 将 DataURL 转换为 Blob
  const dataURLtoBlob = (dataUrl: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert to blob'));
          }
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  };

  // 发送 POST 请求到 n8n
  const sendToWebhook = async (lineartDataUrl: string, maskDataUrl: string): Promise<string> => {
    // 压缩图片
    setLoadingStep('压缩图片中...');
    const [compressedLineart, compressedMask] = await Promise.all([
      compressImage(lineartDataUrl),
      compressImage(maskDataUrl)
    ]);

    // 转换为 Blob
    const [lineartBlob, maskBlob] = await Promise.all([
      dataURLtoBlob(compressedLineart),
      dataURLtoBlob(compressedMask)
    ]);

    // 创建 FormData
    const formData = new FormData();
    formData.append('lineart', lineartBlob, 'lineart.jpg');
    formData.append('mask', maskBlob, 'mask.jpg');

    // 发送请求
    const response = await fetch('https://n8n.prismlab.top/webhook/apple-generate', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // 兼容性提取：n8n 返回的是数组格式
    const promptId = Array.isArray(data) ? data[0].prompt_id : data.prompt_id;

    if (!promptId) {
      throw new Error('未获取到有效的 prompt_id，请检查后端返回数据');
    }

    return promptId;
  };

  // 轮询查件
  const pollForResult = (promptId: string): Promise<{ preview_url: string; prod_url: string }> => {
    return new Promise((resolve, reject) => {
      setLoadingStep('云端显卡渲染中...');

      // 立即执行一次查询
      const check = async () => {
        try {
          const response = await fetch(`https://n8n.prismlab.top/webhook/check-image?prompt_id=${promptId}`);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          if (data.status === 'done') {
            clearPolling();
            console.log('渲染完成!', data);
            resolve({
              preview_url: data.preview_url,
              prod_url: data.prod_url
            });
          } else if (data.status === 'failed') {
            clearPolling();
            reject(new Error('渲染失败'));
          } else {
            // 继续轮询
            setLoadingStep(`云端显卡渲染中... (${data.progress || '处理中'})`);
          }
        } catch (error) {
          clearPolling();
          reject(error);
        }
      };

      // 启动定时器，每3秒查询一次
      pollingIntervalRef.current = setInterval(check, 3000);
      check(); // 立即执行第一次
    });
  };

  const generateImages = async () => {
    if (!fabricCanvas) return;

    // 清理之前的轮询
    clearPolling();
    
    setIsGenerating(true);
    setLoadingStep('正在读取线稿坐标...');
    setResultImages(null);

    try {
      // 创建导出画布
      const exportCanvas = new fabric.Canvas(null, {
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        preserveObjectStacking: true,
      });

      // 克隆线稿对象
      const lineartObjects = fabricCanvas.getObjects().filter(obj => (obj as any).id === 'lineart-layer');

      for (const obj of lineartObjects) {
        const clonedObj = await obj.clone();
        exportCanvas.add(clonedObj);
      }

      // 1. 导出白底线稿 (lineart)
      exportCanvas.set('backgroundColor', '#FFFFFF');
      exportCanvas.renderAll();

      const lineartDataUrl = exportCanvas.toDataURL({
        format: 'png',
        multiplier: 1,
        quality: 1
      });

      setLoadingStep('AI 引擎切割中...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2. 导出黑底白遮罩 (mask)
      exportCanvas.set('backgroundColor', '#000000');

      const filter = new fabric.filters.ColorMatrix({
        matrix: [
          0, 0, 0, 0, 255,
          0, 0, 0, 0, 255,
          0, 0, 0, 0, 255,
          0, 0, 0, 1, 0
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

      const maskDataUrl = exportCanvas.toDataURL({
        format: 'png',
        multiplier: 1,
        quality: 1
      });

      // 清理导出画布
      exportCanvas.dispose();

      // 保存到历史记录
      setHistory(prev => [{
        id: Date.now().toString(),
        line: lineartDataUrl,
        mask: maskDataUrl,
        timestamp: Date.now()
      }, ...prev]);

      // 步骤2: 发单拿号
      setLoadingStep('排队中...');
      const promptId = await sendToWebhook(lineartDataUrl, maskDataUrl);

      // 步骤3 & 4: 轮询查件 & 处理结果
      const result = await pollForResult(promptId);

      // 展示结果
      setResultImages({
        effect: result.preview_url,
        production: result.prod_url
      });

    } catch (error) {
      console.error('生成失败:', error);
      alert('生成失败，请重试');
    } finally {
      clearPolling();
      setIsGenerating(false);
    }
  };

  // 下载图片函数（跨域兼容）
  const downloadImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('下载失败:', error);
      // 降级方案：直接打开链接
      window.open(url, '_blank');
    }
  };

  return (
    <div 
      className="min-h-screen text-gray-800 relative overflow-hidden font-sans"
      style={{
        background: 'linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)',
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-[100] bg-gray-500/10 backdrop-blur-sm border-4 border-dashed border-gray-400 flex items-center justify-center">
          <div className="text-2xl font-bold text-gray-700 tracking-wider flex items-center gap-4 bg-white/90 backdrop-blur-xl px-8 py-4 rounded-2xl border border-gray-200 shadow-xl">
            <Upload className="w-8 h-8 animate-bounce text-gray-600" />
            松开鼠标，将图片添加到画布
          </div>
        </div>
      )}

      {/* Background decoration - subtle glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-400/10 blur-[120px] rounded-full" />
      </div>

      {/* Main Layout - Floating Widgets Structure */}
      <div className="relative z-10 w-full h-screen flex flex-col p-3 md:p-4">
        
        {/* Central Canvas - Full Area */}
        <div className="flex-1 flex items-center justify-center pb-24">
          <div className="w-auto h-full max-w-[85vw] max-h-[70vh] aspect-square relative overflow-hidden group"
            style={{
              background: 'rgba(255, 255, 255, 0.6)',
              backdropFilter: 'blur(10px)',
              borderRadius: '20px',
              boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.12)',
            }}
          >
            <div ref={containerRef} className="w-full h-full relative flex items-center justify-center bg-transparent">
              <canvas ref={canvasRef} className="w-full h-full" />
            </div>

            {/* Canvas Overlay Info */}
            <div className="absolute top-4 left-4 pointer-events-none">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-xs font-mono text-gray-500 tracking-wider">Ready</span>
              </div>
            </div>

            {/* Floating Edit Toolbar */}
            {selectedObject && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white/90 backdrop-blur-md px-3 py-2 rounded-2xl border border-gray-100 shadow-lg">
                <button onClick={handleUndo} disabled={!canUndo} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-all disabled:opacity-30" title="撤销">
                  <Undo2 className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-gray-200" />
                <button onClick={handleRotateLeft} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-all">
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button onClick={handleRotateRight} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-all">
                  <RotateCw className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-gray-200" />
                <button onClick={handleFlipHorizontal} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-all">
                  <FlipHorizontal className="w-4 h-4" />
                </button>
                <button onClick={handleFlipVertical} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-all">
                  <FlipVertical className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-gray-200" />
                <button onClick={handleDelete} className="p-2 hover:bg-red-50 rounded-xl text-red-400 hover:text-red-500 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-gray-200" />
                <button onClick={handleCancelSelection} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 text-xs font-medium">
                  完成
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Fixed Toolbar - All Functions */}
        <div className="fixed bottom-0 left-0 right-0 rounded-t-3xl px-6 py-4 pb-safe z-40"
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center justify-between w-full max-w-3xl mx-auto">
            {/* Upload */}
            <label className="p-3 rounded-2xl hover:bg-orange-50 transition-all cursor-pointer group active:bg-orange-100" title="上传图片">
              <Upload className="w-6 h-6 text-gray-600 group-hover:text-orange-500" />
              <input type="file" accept="image/png" className="hidden" onChange={handleFileUpload} />
            </label>

            {/* Reset */}
            <button onClick={handleReset} className="p-3 rounded-2xl hover:bg-orange-50 transition-all group active:bg-orange-100" title="重置">
              <RefreshCw className="w-6 h-6 text-gray-600 group-hover:text-orange-500" />
            </button>

            {/* Generate Button - Prominent */}
            <button 
              onClick={generateImages}
              disabled={isGenerating}
              className="px-10 py-3 flex items-center gap-2 font-bold text-lg rounded-2xl transition-all active:scale-95 shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                boxShadow: '0 4px 20px rgba(249, 115, 22, 0.4)',
                color: 'white',
              }}
            >
              <Wand2 className="w-6 h-6" />
              <span>生成</span>
            </button>

            {/* Reference Layer Toggle */}
            <button onClick={toggleReferenceLayer} className={`p-3 rounded-2xl transition-all ${activeLayer === 'reference' ? 'bg-orange-100 text-orange-600 ring-2 ring-orange-200' : 'hover:bg-orange-50 text-gray-600 hover:text-orange-500'}`} title="参考层">
              <Layers className="w-6 h-6" />
            </button>

            {/* Admin Settings */}
            <button onClick={() => setShowAdmin(true)} className="p-3 rounded-2xl hover:bg-orange-50 transition-all group active:bg-orange-100" title="管理">
              <Settings className="w-6 h-6 text-gray-600 group-hover:text-orange-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Modals - Updated with Glass Style */}
      {isGenerating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/50 backdrop-blur-xl">
          <div className="p-10 w-[400px] flex flex-col items-center text-center rounded-3xl"
            style={{
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.5)'
            }}
          >
            <div className="w-20 h-20 mb-8 relative">
              <div className="absolute inset-0 border-2 border-gray-200 rounded-full" />
              <div className="absolute inset-0 border-2 border-orange-500 rounded-full border-t-transparent animate-spin" />
              <Wand2 className="absolute inset-0 m-auto w-8 h-8 text-orange-500 animate-pulse" />
            </div>
            <h3 className="text-2xl font-medium mb-3 text-gray-800">AI 核心处理中</h3>
            <p className="text-sm text-orange-600 font-mono tracking-widest uppercase">{loadingStep}</p>
            <div className="w-full h-1 bg-gray-200 rounded-full mt-8 overflow-hidden">
              <div className="h-full bg-orange-500 w-1/3 animate-[shimmer_2s_infinite]" />
            </div>
          </div>
        </div>
      )}

      {/* Result Modal */}
      {resultImages && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/50 backdrop-blur-xl p-4">
          <div className="max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col rounded-3xl"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.5)'
            }}
          >
            <div className="flex justify-between items-center p-8 border-b border-gray-200">
              <h2 className="text-2xl font-medium tracking-tight text-gray-800">生成结果 <span className="text-orange-500 ml-2 text-sm font-mono tracking-widest uppercase">Success</span></h2>
              <button onClick={() => setResultImages(null)} className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-all">
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-sm font-mono text-gray-500 uppercase tracking-widest">Preview Render</h3>
                  <Download className="w-4 h-4 text-gray-400" />
                </div>
                <div className="aspect-square rounded-3xl overflow-hidden bg-gray-100 border border-gray-200 shadow-inner">
                  <img src={resultImages.effect} alt="Effect Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <button 
                  className="w-full py-4 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all text-sm font-medium border border-gray-200 text-gray-700"
                  onClick={() => downloadImage(resultImages.effect, 'preview.jpg')}
                >
                  下载预览图
                </button>
              </div>
              
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-sm font-mono text-orange-500 uppercase tracking-widest">Production Layout</h3>
                  <Download className="w-4 h-4 text-orange-500/40" />
                </div>
                <div className="aspect-square rounded-3xl overflow-hidden bg-gray-100 border border-orange-200 shadow-inner">
                  <img src={resultImages.production} alt="Production Layout" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <button 
                  className="w-full py-4 rounded-2xl bg-orange-100 hover:bg-orange-200 transition-all text-sm font-medium border border-orange-200 text-orange-600"
                  onClick={() => downloadImage(resultImages.production, 'production.jpg')}
                >
                  下载生产图
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Modal */}
      {showAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/50 backdrop-blur-xl p-4">
          <div className="max-w-6xl w-full h-[90vh] flex flex-col rounded-3xl"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.5)'
            }}
          >
            <div className="flex justify-between items-center p-8 border-b border-gray-200">
              <h2 className="text-2xl font-medium tracking-tight flex items-center gap-4 text-gray-800">
                <Shield className="w-7 h-7 text-orange-500" />
                管理者模式 <span className="text-gray-400 text-sm font-mono">/ History</span>
              </h2>
              <button onClick={() => setShowAdmin(false)} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-4">
                  <Layers className="w-12 h-12 opacity-30" />
                  <span className="text-sm font-mono uppercase tracking-widest">No Records Found</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-10">
                  {history.map((item, index) => (
                    <div className="p-8 flex flex-col gap-8 rounded-2xl"
                      style={{
                        background: 'rgba(255, 255, 255, 0.5)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(0, 0, 0, 0.05)'
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-gray-200 pb-6">
                        <div className="flex items-center gap-4">
                          <span className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 font-mono text-sm">
                            {history.length - index}
                          </span>
                          <span className="text-lg font-medium text-gray-800">Task Sequence</span>
                        </div>
                        <span className="text-xs text-gray-400 font-mono tracking-wider">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Line Art Composite</span>
                            <button onClick={() => {
                              const a = document.createElement('a');
                              a.href = item.line;
                              a.download = `LINE_${item.id}.png`;
                              a.click();
                            }} className="text-[10px] text-orange-500 hover:underline uppercase tracking-widest">Download</button>
                          </div>
                          <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
                            <img src={item.line} alt="LINE" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Character Mask</span>
                            <button onClick={() => {
                              const a = document.createElement('a');
                              a.href = item.mask;
                              a.download = `MASK_${item.id}.png`;
                              a.click();
                            }} className="text-[10px] text-orange-500 hover:underline uppercase tracking-widest">Download</button>
                          </div>
                          <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
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
