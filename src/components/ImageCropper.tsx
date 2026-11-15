import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '@/utils/cropImage';

type Area = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

const ImageCropper: React.FC<ImageCropperProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropChange = (location: { x: number; y: number }) => {
    setCrop(location);
  };

  const onZoomChange = (zoom: number) => {
    setZoom(zoom);
  };

  const onCropCompleteHandler = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (croppedBlob) {
        onCropComplete(croppedBlob);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
      <div className="relative flex-1 w-full overflow-hidden">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropCompleteHandler}
        />
      </div>

      <div className="bg-white p-6 pb-10 rounded-t-2xl flex flex-col gap-6 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-gray-500">缩放</span>
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            aria-labelledby="Zoom"
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 h-12 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm active:scale-95 transition-transform"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 h-12 rounded-xl bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
          >
            确认裁剪
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropper;
