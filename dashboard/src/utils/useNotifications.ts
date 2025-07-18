import Swal, { type SweetAlertOptions } from "sweetalert2";

export function useNotification() {
  const getTheme = () =>
    typeof document !== "undefined"
      ? document.documentElement.getAttribute("data-theme") || "light"
      : "light";

  const getThemeColors = () => ({
    background: getTheme() === "dark" ? "#1d1d1d" : "#ffffff",
    color: getTheme() === "dark" ? "#ffffff" : "#545454",
  });

  const toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    background: getThemeColors().background,
    color: getThemeColors().color,
    inputAttributes: {
      autocomplete: "new-password",
      autocapitalize: "off",
      autocorrect: "off",
    },
    didOpen: (toast) => {
      // Update colors when toast opens
      const colors = getThemeColors();
      toast.style.background = colors.background;
      toast.style.color = colors.color;
    },
  });

  return {
    success: (message: string) =>
      toast.fire({
        icon: "success",
        title: message,
        theme: getTheme() as SweetAlertOptions["theme"],
      }),
    error: (message: string) =>
      toast.fire({
        icon: "error",
        title: message,
        theme: getTheme() as SweetAlertOptions["theme"],
      }),
    warning: (message: string) =>
      toast.fire({
        icon: "warning",
        title: message,
        theme: getTheme() as SweetAlertOptions["theme"],
      }),
    info: (message: string) =>
      toast.fire({
        icon: "info",
        title: message,
        theme: getTheme() as SweetAlertOptions["theme"],
      }),
    confirm: (options: {
      title: string;
      text: string;
      icon?: "warning" | "error" | "success" | "info" | "question";
    }) =>
      Swal.fire({
        ...options,
        background: getThemeColors().background,
        color: getThemeColors().color,
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes",
        cancelButtonText: "No",
        theme: getTheme() as SweetAlertOptions["theme"],
      }),
    inputConfirm: async (options: {
      title: string;
      text: string;
      inputLabel: string;
      inputPlaceholder?: string;
      icon?: "warning" | "error" | "success" | "info" | "question";
    }) => {
      const result = await Swal.fire({
        title: options.title,
        text: options.text,
        input: "text",
        inputLabel: options.inputLabel,
        inputPlaceholder: options.inputPlaceholder || "",
        inputAttributes: {
          autocomplete: "new-password",
          autocapitalize: "off",
          autocorrect: "off",
        },
        background: getThemeColors().background,
        color: getThemeColors().color,
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Confirm",
        cancelButtonText: "Cancel",
        theme: getTheme() as SweetAlertOptions["theme"],
      });

      return result.value;
    },
  };
}