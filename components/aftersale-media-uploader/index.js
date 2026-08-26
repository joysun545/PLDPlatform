Component({
  properties: {
    files: {
      type: Array,
      value: []
    },
    maxCount: {
      type: Number,
      value: 9
    },
    allowDocument: {
      type: Boolean,
      value: false
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  data: {
    recording: false,
    longPressTriggered: false
  },

  lifetimes: {
    attached() {
      this.cameraContext = wx.createCameraContext();
      this.captureStartRequested = false;
      this.stopAfterRecordStart = false;
      this.recordingActive = false;
      this.recordStopInFlight = false;
    },
    detached() {
      if (this.longPressTimer) clearTimeout(this.longPressTimer);
      this.captureStartRequested = false;
      this.stopAfterRecordStart = false;
      this.recordingActive = false;
    }
  },

  methods: {
    remaining() {
      return Math.max(0, Number(this.properties.maxCount || 0) - this.properties.files.length);
    },

    createFile(path, mediaType, extra = {}) {
      return {
        key: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
        path,
        media_type: mediaType,
        status: 'PENDING',
        ...extra
      };
    },

    append(files) {
      const remaining = this.remaining();
      if (!remaining) {
        wx.showToast({ title: '附件数量已达上限', icon: 'none' });
        return;
      }
      const next = this.properties.files.concat(files.slice(0, remaining));
      this.triggerEvent('change', { files: next });
    },

    startCapture() {
      if (
        this.properties.disabled ||
        !this.remaining() ||
        this.captureStartRequested ||
        this.recordingActive ||
        this.recordStopInFlight
      ) return;
      this.stopAfterRecordStart = false;
      this.setData({ longPressTriggered: false });
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        // Mark this before startRecord resolves.  A user can release their
        // finger while the native camera is still starting; in that case we
        // must stop the video as soon as it starts instead of taking a photo.
        this.captureStartRequested = true;
        this.setData({ longPressTriggered: true });
        this.cameraContext.startRecord({
          success: () => {
            this.recordingActive = true;
            this.setData({ recording: true });
            if (this.stopAfterRecordStart) {
              this.stopRecording();
            } else {
              wx.showToast({ title: '正在录制，松开结束', icon: 'none' });
            }
          },
          fail: () => {
            this.captureStartRequested = false;
            this.stopAfterRecordStart = false;
            this.recordingActive = false;
            this.setData({ recording: false });
            wx.showToast({ title: '无法开始录像，请检查相机权限', icon: 'none' });
          }
        });
      }, 350);
    },

    endCapture() {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      if (this.captureStartRequested) {
        if (this.recordingActive) {
          this.stopRecording();
        } else {
          this.stopAfterRecordStart = true;
        }
        return;
      }
      if (!this.data.longPressTriggered) {
        this.cameraContext.takePhoto({
          quality: 'high',
          success: res => this.append([this.createFile(res.tempImagePath, 'IMAGE')]),
          fail: () => wx.showToast({ title: '拍照失败，请检查相机权限', icon: 'none' })
        });
      }
    },

    stopRecording() {
      if (!this.recordingActive || this.recordStopInFlight) return;
      this.recordStopInFlight = true;
      this.cameraContext.stopRecord({
        success: res => {
          this.append([this.createFile(res.tempVideoPath, 'VIDEO')]);
        },
        fail: () => wx.showToast({ title: '录像保存失败，请重试', icon: 'none' }),
        complete: () => {
          this.captureStartRequested = false;
          this.stopAfterRecordStart = false;
          this.recordingActive = false;
          this.recordStopInFlight = false;
          this.setData({ recording: false });
        }
      });
    },

    cancelCapture() {
      this.endCapture();
    },

    onCameraError() {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      this.captureStartRequested = false;
      this.stopAfterRecordStart = false;
      this.recordingActive = false;
      this.recordStopInFlight = false;
      this.setData({ recording: false });
      wx.showToast({ title: '相机不可用，请检查相机权限', icon: 'none' });
    },

    chooseLocalMedia() {
      if (this.properties.disabled || !this.remaining()) return;
      wx.chooseMedia({
        count: this.remaining(),
        mediaType: ['image', 'video'],
        sourceType: ['album'],
        success: res => {
          this.append((res.tempFiles || []).map(file => this.createFile(
            file.tempFilePath,
            file.fileType === 'video' ? 'VIDEO' : 'IMAGE',
            { duration_seconds: file.duration || null }
          )));
        }
      });
    },

    chooseDocument() {
      if (this.properties.disabled || !this.properties.allowDocument || !this.remaining()) return;
      wx.chooseMessageFile({
        count: this.remaining(),
        type: 'file',
        success: res => {
          this.append((res.tempFiles || []).map(file => {
            const name = file.name || '';
            const suffix = name.split('.').pop().toLowerCase();
            let mediaType = 'DOCUMENT';
            if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(suffix)) mediaType = 'IMAGE';
            if (['mp4', 'mov', 'm4v', '3gp'].includes(suffix)) mediaType = 'VIDEO';
            return this.createFile(file.path, mediaType, { name });
          }));
        }
      });
    },

    onRemoveFile(e) {
      if (this.properties.disabled) return;
      const index = Number(e.currentTarget.dataset.index);
      if (!Number.isInteger(index) || index < 0 || index >= this.properties.files.length) {
        wx.showToast({ title: '附件索引无效，请重新选择', icon: 'none' });
        return;
      }
      const files = this.properties.files.slice();
      files.splice(index, 1);
      this.triggerEvent('change', { files });
    },

    retry(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (!Number.isInteger(index) || !this.properties.files[index]) return;
      this.triggerEvent('retry', { index, file: this.properties.files[index] });
    },

    preview(e) {
      const index = Number(e.currentTarget.dataset.index);
      const file = this.properties.files[index];
      if (!file || !file.path) return;
      if (file.media_type === 'IMAGE') {
        wx.previewImage({
          current: file.path,
          urls: this.properties.files
            .filter(item => item.media_type === 'IMAGE' && item.path)
            .map(item => item.path)
        });
        return;
      }
      if (file.media_type === 'VIDEO' && wx.previewMedia) {
        wx.previewMedia({ sources: [{ url: file.path, type: 'video' }] });
      }
    }
  }
});
