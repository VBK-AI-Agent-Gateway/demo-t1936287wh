/* Nimbus landing page interactions */
(function () {
  "use strict";

  // 移动端导航菜单
  var toggle = document.getElementById("navToggle");
  var menu = document.getElementById("navMenu");
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    });
    // 点击菜单项后自动收起
    menu.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // CTA 表单：本地校验 + 反馈（无后端）
  var form = document.querySelector(".cta-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = form.querySelector("input[type=email]");
      var btn = form.querySelector("button");
      if (!input || !btn) return;
      var val = (input.value || "").trim();
      var ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      if (!ok) {
        input.setAttribute("aria-invalid", "true");
        input.focus();
        alert("请输入有效的工作邮箱地址");
        return;
      }
      input.removeAttribute("aria-invalid");
      btn.disabled = true;
      btn.textContent = "已提交 ✓";
      input.value = "";
      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = "免费开始";
      }, 2500);
    });
  }

  // FAQ: 同时只展开一项（<details> 原生可用，此为增强）
  var faqs = document.querySelectorAll(".faq-item");
  faqs.forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (item.open) {
        faqs.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      }
    });
  });
})();