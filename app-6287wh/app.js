// 荣威RX5 控车APP · 交互
(function () {
  var toast = document.getElementById('toast');
  var timer = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }
  window.__toast = showToast;

  // ---- Tab 页面切换 ----
  function goto(page) {
    document.querySelectorAll('.page').forEach(function (p) {
      p.classList.toggle('active', p.id === 'page-' + page);
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.page === page);
    });
    document.getElementById('content').scrollTop = 0;
  }
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () { goto(tab.dataset.page); });
  });
  document.querySelectorAll('[data-goto]').forEach(function (el) {
    el.addEventListener('click', function () { goto(el.dataset.goto); });
  });

  // ---- 快捷控车 ----
  document.querySelectorAll('.quick-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var a = btn.dataset.action;
      if (a === '解锁' || a === '闭锁') {
        document.querySelectorAll('.quick-btn').forEach(function (b) {
          if (b.dataset.action === '解锁' || b.dataset.action === '闭锁') b.classList.remove('on');
        });
        btn.classList.add('on');
        showToast('指令已发送：车辆' + a);
      } else if (a === '空调') {
        btn.classList.toggle('on');
        showToast(btn.classList.contains('on') ? '空调已开启 · 24°C' : '空调已关闭');
      } else if (a === '寻车') {
        showToast('正在双闪鸣笛寻车…');
        btn.classList.add('on');
        setTimeout(function () { btn.classList.remove('on'); }, 3000);
      } else if (a === '后备箱') {
        btn.classList.toggle('on');
        showToast(btn.classList.contains('on') ? '后备箱已开启' : '后备箱已关闭');
      }
    });
  });

  // ---- 通用 data-toast 按钮 ----
  document.querySelectorAll('[data-toast]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      showToast(el.dataset.toast);
    });
  });

  // ---- 开关 ----
  document.querySelectorAll('[data-sw]').forEach(function (sw) {
    sw.addEventListener('click', function () {
      sw.classList.toggle('on');
      showToast(sw.classList.contains('on') ? '已开启' : '已关闭');
    });
  });
})();