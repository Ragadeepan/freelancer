export default function UploadBox() {
  return (
    <div className="glass-card rounded-2xl p-6">
      <h4 className="text-sm font-semibold text-white">Files & deliverables</h4>
      <div className="mt-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-center text-sm text-slate-400">
        Drag files here or <span className="text-slate-200">upload</span>
      </div>
      <div className="mt-4 space-y-3 text-sm text-slate-300">
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2">
          <span>UI-Flow-v4.fig</span>
          <span className="text-xs text-slate-500">58 MB</span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2">
          <span>Prototype.mp4</span>
          <span className="text-xs text-slate-500">123 MB</span>
        </div>
      </div>
    </div>
  );
}
