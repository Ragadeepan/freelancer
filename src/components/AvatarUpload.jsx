import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Cropper from "react-easy-crop";
import { getCroppedImg, resizeImage } from "../utils/imageUtils.js";
import { PRESET_AVATARS } from "../data/avatars.js";
import Button from "./Button.jsx";
import {
    getStorageUploadErrorMessage,
    uploadProfilePicture
} from "../services/storageService.js";
import { useToast } from "../contexts/ToastContext.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import clsx from "../utils/clsx.js";
import { resolveFileUrl } from "../utils/fileUrl.js";

export default function AvatarUpload({ currentPhotoURL, onUploadSuccess, initial = "U" }) {
    const { user } = useAuth();
    const toast = useToast();

    // Storage & UI States
    const [imageSrc, setImageSrc] = useState(null); // The raw image for cropper
    const [pendingFile, setPendingFile] = useState(null); // The cropped file ready for upload
    const [pendingPreview, setPendingPreview] = useState(null); // Local preview of cropped image or selected preset

    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    const [isCropping, setIsCropping] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showPresets, setShowPresets] = useState(false);
    const [genderFilter, setGenderFilter] = useState("all");

    const fileInputRef = useRef(null);

    const openFilePicker = () => {
        const input = fileInputRef.current;
        if (!input) return;
        try {
            if (typeof input.showPicker === "function") {
                input.showPicker();
                return;
            }
        } catch (_err) {
            // Fallback to click for browsers without showPicker support.
        }
        input.click();
    };

    useEffect(() => {
        setImgError(false);
    }, [currentPhotoURL, pendingPreview]);

    useEffect(() => {
        return () => {
            if (typeof pendingPreview === "string" && pendingPreview.startsWith("blob:")) {
                URL.revokeObjectURL(pendingPreview);
            }
        };
    }, [pendingPreview]);

    const filteredPresets = useMemo(() => {
        if (genderFilter === "all") return PRESET_AVATARS;
        return PRESET_AVATARS.filter(a => a.gender === genderFilter);
    }, [genderFilter]);

    const onCropComplete = useCallback((_croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleFileChange = async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.addEventListener("load", () => {
                setImageSrc(reader.result);
                setIsCropping(true);
            });
            reader.readAsDataURL(file);
            e.target.value = "";
        }
    };

    const handleApplyCrop = async () => {
        try {
            const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
            if (!croppedImageBlob) throw new Error("Could not crop image");

            const croppedFile = new File([croppedImageBlob], "avatar.jpg", { type: "image/jpeg" });
            const resizedFile = await resizeImage(croppedFile, 250, 250);

            if (typeof pendingPreview === "string" && pendingPreview.startsWith("blob:")) {
                URL.revokeObjectURL(pendingPreview);
            }
            setPendingFile(resizedFile);
            setPendingPreview(URL.createObjectURL(croppedImageBlob));
            setIsCropping(false);
            setImageSrc(null);
            toast.success("Crop applied. Now click 'Save Profile' to upload.");
        } catch (e) {
            console.error(e);
            toast.error("Failed to crop image.");
        }
    };

    const handleFinalSave = async () => {
        if (!user) {
            toast.error("Please log in to save your photo");
            return;
        }

        // If it's a preset URL (string), we just call success
        if (typeof pendingPreview === "string" && !pendingFile) {
            try {
                setIsUploading(true);
                await Promise.resolve(onUploadSuccess?.(pendingPreview));
                setPendingPreview(null);
                toast.success("Avatar selection saved!");
            } catch (e) {
                console.error(e);
                toast.error("Failed to save avatar selection.");
            } finally {
                setIsUploading(false);
            }
            return;
        }

        if (!pendingFile) return;

        try {
            setIsUploading(true);
            const url = await uploadProfilePicture({
                uid: user.uid,
                file: pendingFile,
                onProgress: setUploadProgress
            });

            await Promise.resolve(onUploadSuccess?.(url));
            setPendingFile(null);
            setPendingPreview(null);
            toast.success("Profile photo uploaded successfully!");
        } catch (e) {
            console.error(e);
            toast.error(getStorageUploadErrorMessage(e, "Failed to upload image."));
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handlePresetSelect = (avatarUrl) => {
        if (typeof pendingPreview === "string" && pendingPreview.startsWith("blob:")) {
            URL.revokeObjectURL(pendingPreview);
        }
        setPendingPreview(avatarUrl);
        setPendingFile(null);
        setShowPresets(false);
        toast.success("Preset selected. Click 'Save Profile' to confirm.");
    };

    const [imgError, setImgError] = useState(false);
    const currentDisplayURL = pendingPreview || resolveFileUrl(currentPhotoURL);

    return (
        <div className="flex flex-col items-center gap-6 sm:flex-row rounded-[2rem] border border-white/10 bg-night-800/40 p-6 shadow-2xl animate-reveal-up overflow-hidden relative group/container">
            {/* Background Glow */}
            <div className="absolute -left-10 -top-10 h-32 w-32 bg-glow-cyan/5 blur-3xl pointer-events-none" />

            <div className="relative shrink-0">
                <div
                    onClick={openFilePicker}
                    className={clsx(
                        "h-32 w-32 overflow-hidden rounded-full border-4 transition-all duration-300 shadow-huge relative ring-2",
                        (pendingPreview || (currentPhotoURL && !imgError))
                            ? "border-glow-cyan/50 ring-glow-cyan/30"
                            : "border-white/10 ring-transparent group-hover/container:border-glow-cyan/40"
                    )}
                >
                    {currentDisplayURL && !imgError ? (
                        <img
                            src={currentDisplayURL}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-5xl font-bold text-slate-400 bg-night-800">
                            {initial}
                        </div>
                    )}

                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                        <span className="text-[10px] font-bold text-white uppercase tracking-tighter">Replace Photo</span>
                    </div>
                </div>

                {isUploading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                        <div className="text-sm font-bold text-glow-cyan animate-pulse">{uploadProgress}%</div>
                    </div>
                )}
            </div>

            <div className="flex-1 text-center sm:text-left">
                <h3 className="text-xl font-bold text-white tracking-tight">
                    {pendingPreview ? "Confirm Your Photo" : "Profile Picture"}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                    {pendingPreview
                        ? "You've selected a new photo. Save it to update your profile."
                        : "Upload a photo or select a character avatar."}
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="sr-only"
                    />

                    {pendingPreview ? (
                        <>
                            <Button
                                size="sm"
                                variant="primary"
                                onClick={handleFinalSave}
                                disabled={isUploading}
                                className="rounded-xl px-6 py-2.5 shadow-glow"
                            >
                                {isUploading ? "Uploading..." : "Save Profile"}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    if (typeof pendingPreview === "string" && pendingPreview.startsWith("blob:")) {
                                        URL.revokeObjectURL(pendingPreview);
                                    }
                                    setPendingPreview(null);
                                    setPendingFile(null);
                                }}
                                disabled={isUploading}
                                className="rounded-xl px-4 py-2.5 bg-white/5"
                            >
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={openFilePicker}
                                className="rounded-xl px-5 py-2.5 bg-white/5 border border-white/5 hover:border-glow-cyan/30"
                            >
                                Upload File
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setShowPresets(true)}
                                className="rounded-xl px-5 py-2.5 bg-white/5 border border-white/5 hover:border-glow-cyan/30"
                            >
                                Presets
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Preset Avatars Selection Modal */}
            {showPresets && createPortal(
                <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-reveal-up">
                    <div className="glass-card w-full max-w-2xl rounded-[2.5rem] p-8 border border-white/10 shadow-huge overflow-hidden">
                        <div className="flex items-center justify-between mb-8">
                            <h4 className="text-2xl font-bold text-white tracking-tight">Choose Avatar Style</h4>
                            <button onClick={() => setShowPresets(false)} className="text-slate-400 hover:text-white transition-all active:scale-90 bg-white/5 p-2 rounded-xl">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="flex gap-2 mb-8 p-1 bg-white/5 rounded-2xl w-fit">
                            {['all', 'male', 'female'].map((g) => (
                                <button
                                    key={g}
                                    onClick={() => setGenderFilter(g)}
                                    className={clsx(
                                        "px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all",
                                        genderFilter === g ? "bg-glow-cyan text-night-900 shadow-glow" : "text-slate-400 hover:text-slate-200"
                                    )}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-6 mb-8 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                            {filteredPresets.map((avatar) => (
                                <div key={avatar.id} onClick={() => handlePresetSelect(avatar.url)} className="group cursor-pointer flex flex-col items-center">
                                    <div className="h-24 w-24 overflow-hidden rounded-[2rem] border-2 border-white/5 bg-night-900 group-hover:border-glow-cyan transition-all group-active:scale-95">
                                        <img src={avatar.url} alt={avatar.label} className="h-full w-full transition-transform group-hover:scale-110" />
                                    </div>
                                    <span className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-glow-cyan">{avatar.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Cropper Modal */}
            {isCropping && createPortal(
                <div className="fixed inset-0 z-[999] flex flex-col bg-night-950 p-4 sm:p-10 overflow-hidden">
                    <div className="flex items-center justify-between mb-8 max-w-5xl mx-auto w-full">
                        <h2 className="text-3xl font-bold text-white tracking-tight text-glow-cyan">Crop Your Image</h2>
                        <button onClick={() => { setIsCropping(false); setImageSrc(null); }} className="bg-white/5 p-3 rounded-2xl text-slate-400 hover:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>

                    <div className="relative flex-1 max-w-5xl mx-auto w-full rounded-[3rem] border border-white/10 overflow-hidden bg-black/40">
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            onCropChange={setCrop}
                            onCropComplete={onCropComplete}
                            onZoomChange={setZoom}
                            cropShape="round"
                            showGrid={false}
                            style={{
                                cropAreaStyle: { border: '2px solid rgba(77, 242, 255, 0.5)', boxShadow: '0 0 0 9999px rgba(11, 15, 25, 0.85)' }
                            }}
                        />
                    </div>

                    <div className="mt-8 mx-auto w-full max-w-xl bg-night-900 border border-white/10 p-8 rounded-[2.5rem] shadow-huge">
                        <input
                            type="range"
                            value={zoom}
                            min={1}
                            max={3}
                            step={0.1}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-glow-cyan mb-8"
                        />
                        <div className="flex gap-4">
                            <Button variant="ghost" className="flex-1 rounded-2xl h-14 bg-white/5" onClick={() => { setIsCropping(false); setImageSrc(null); }}>Discard</Button>
                            <Button className="flex-[2] rounded-2xl h-14 shadow-glow" onClick={handleApplyCrop}>Apply Crop</Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
