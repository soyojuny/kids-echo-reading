import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/server/supabase/server";
import { fetchBookPages } from "@/server/supabase/bookPages";

const fileNameCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

type RouteParams = {
  params: Promise<{ bookId: string }>;
};

function sanitizeFileName(fileName: string): string {
  return encodeURIComponent(fileName.replace(/\s+/g, "-").replace(/[^\w.-]/g, ""));
}

export async function GET(_: Request, context: RouteParams) {
  try {
    const { bookId } = await context.params;
    const pages = await fetchBookPages(bookId);
    return NextResponse.json({ pages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteParams) {
  try {
    const { bookId } = await context.params;
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File)
      .sort((a, b) => fileNameCollator.compare(a.name, b.name));

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: existingRows, error: pageNumberError } = await supabase
      .from("book_pages")
      .select("page_number")
      .eq("book_id", bookId)
      .order("page_number", { ascending: false })
      .limit(1);

    if (pageNumberError) {
      return NextResponse.json({ error: pageNumberError.message }, { status: 500 });
    }

    const startPageNumber = (existingRows?.[0]?.page_number ?? 0) + 1;

    const insertedRows: Array<{
      book_id: string;
      page_number: number;
      image_path: string;
      input_status: "empty";
      confirmed_text: string | null;
    }> = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const safeName = sanitizeFileName(file.name || `page-${index + 1}.png`);
      const imagePath = `${bookId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const bytes = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("book-pages")
        .upload(imagePath, bytes, {
          contentType: file.type || "application/octet-stream",
          upsert: false
        });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      insertedRows.push({
        book_id: bookId,
        page_number: startPageNumber + index,
        image_path: imagePath,
        input_status: "empty",
        confirmed_text: null
      });
    }

    const { error: insertError } = await supabase.from("book_pages").insert(insertedRows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const pages = await fetchBookPages(bookId);
    return NextResponse.json({ pages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
