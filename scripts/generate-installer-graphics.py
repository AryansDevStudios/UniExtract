import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_gradient(width, height, color_top, color_mid, color_bottom):
    img = Image.new("RGB", (width, height))
    for y in range(height):
        if y < height / 2:
            t = y / (height / 2)
            r = int(color_top[0] * (1 - t) + color_mid[0] * t)
            g = int(color_top[1] * (1 - t) + color_mid[1] * t)
            b = int(color_top[2] * (1 - t) + color_mid[2] * t)
        else:
            t = (y - height / 2) / (height / 2)
            r = int(color_mid[0] * (1 - t) + color_bottom[0] * t)
            g = int(color_mid[1] * (1 - t) + color_bottom[1] * t)
            b = int(color_mid[2] * (1 - t) + color_bottom[2] * t)
        for x in range(width):
            img.putpixel((x, y), (r, g, b))
    return img

def generate_sidebar(out_path, is_uninstall=False):
    width, height = 164, 314
    if not is_uninstall:
        # Deep dark blue to indigo to violet
        img = create_gradient(width, height, (12, 16, 28), (28, 26, 68), (52, 18, 72))
    else:
        # Deep dark slate to dark ruby
        img = create_gradient(width, height, (18, 18, 24), (38, 22, 34), (58, 20, 32))

    # Add subtle radial glow behind the logo
    glow_size = 120
    glow = Image.new("RGBA", (glow_size, glow_size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_color = (99, 102, 241, 60) if not is_uninstall else (225, 29, 72, 50)
    glow_draw.ellipse([10, 10, glow_size - 10, glow_size - 10], fill=glow_color)
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    img.paste(glow, (width // 2 - glow_size // 2, 22), glow)

    # Load and resize icon
    icon_path = "public/icon-512.png"
    if os.path.exists(icon_path):
        icon = Image.open(icon_path).convert("RGBA")
        icon_size = 72
        icon = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        img.paste(icon, (width // 2 - icon_size // 2, 36), icon)

    draw = ImageDraw.Draw(img)

    font_title = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 16)
    font_sub = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 9)
    font_badge = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 9)
    font_footer = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 8)

    # Title
    title = "Uni Extract"
    bbox = draw.textbbox((0, 0), title, font=font_title)
    w_title = bbox[2] - bbox[0]
    draw.text(((width - w_title) // 2, 122), title, font=font_title, fill=(255, 255, 255))

    # Subtitle
    sub = "MEDIA EXTRACTOR" if not is_uninstall else "UNINSTALLER"
    bbox_sub = draw.textbbox((0, 0), sub, font=font_sub)
    w_sub = bbox_sub[2] - bbox_sub[0]
    sub_color = (165, 180, 252) if not is_uninstall else (253, 164, 175)
    draw.text(((width - w_sub) // 2, 144), sub, font=font_sub, fill=sub_color)

    if not is_uninstall:
        # Feature Pills with proper alpha blending
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        
        bullets = [
            "YouTube • TikTok • IG",
            "8K • 4K • 1080p Video",
            "High-Speed Converter"
        ]
        y_start = 172
        for i, text in enumerate(bullets):
            bbox_b = overlay_draw.textbbox((0, 0), text, font=font_badge)
            w_b = bbox_b[2] - bbox_b[0]
            pill_h = 22
            pill_y = y_start + i * 27
            pill_w = max(w_b + 18, 126)
            pill_box = [(width - pill_w) // 2, pill_y, (width + pill_w) // 2, pill_y + pill_h]
            # Subtle glassmorphism pill
            overlay_draw.rounded_rectangle(pill_box, radius=8, fill=(255, 255, 255, 22), outline=(165, 180, 252, 55))
            overlay_draw.text(((width - w_b) // 2, pill_y + 4), text, font=font_badge, fill=(226, 232, 240, 240))
        
        img.paste(overlay, (0, 0), overlay)
    else:
        msg = "We're sorry to see you go!"
        bbox_m = draw.textbbox((0, 0), msg, font=font_badge)
        w_m = bbox_m[2] - bbox_m[0]
        draw.text(((width - w_m) // 2, 195), msg, font=font_badge, fill=(203, 213, 225))

    # Divider line
    for x in range(24, width - 24):
        alpha = 1.0 - abs(x - width / 2) / (width / 2 - 24)
        c = int(79 * alpha + 15 * (1 - alpha))
        c2 = int(70 * alpha + 20 * (1 - alpha))
        c3 = int(229 * alpha + 40 * (1 - alpha))
        draw.point((x, 268), fill=(c, c2, c3))

    # Footer
    footer = "AryansDevStudios"
    bbox_f = draw.textbbox((0, 0), footer, font=font_footer)
    w_f = bbox_f[2] - bbox_f[0]
    draw.text(((width - w_f) // 2, 282), footer, font=font_footer, fill=(100, 116, 139))

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    # Save as 24-bit RGB BMP (standard Windows bitmap without compression)
    img.save(out_path, "BMP")
    print(f"Generated {out_path}")

def generate_header(out_path):
    width, height = 150, 57
    # Pure white background to match standard NSIS page header
    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    icon_path = "public/icon-512.png"
    if os.path.exists(icon_path):
        icon = Image.open(icon_path).convert("RGBA")
        icon_size = 46
        icon = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        # Position right-aligned (x = width - icon_size - 8)
        img.paste(icon, (width - icon_size - 8, (height - icon_size) // 2), icon)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, "BMP")
    print(f"Generated {out_path}")

if __name__ == "__main__":
    generate_sidebar("build-resources/installerSidebar.bmp", is_uninstall=False)
    generate_sidebar("build-resources/uninstallerSidebar.bmp", is_uninstall=True)
    generate_header("build-resources/installerHeader.bmp")
