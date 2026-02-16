import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { NicheType } from '../common/constants';
import { AiOption } from './entities/content.entity';

@Injectable()
export class AiGeneratorService {
  private readonly logger = new Logger(AiGeneratorService.name);

  constructor(private configService: ConfigService) {}

  async generateOptions(input: {
    briefTopic: string;
    briefPoints: string[];
    targetAudience?: string;
    tone?: string;
    nicheTemplate: NicheType;
    customPrompt?: string;
  }): Promise<AiOption[]> {
    const prompt = this.buildPrompt(input);
    const provider = this.configService.get('AI_PROVIDER', 'openai');

    try {
      let result: string;
      if (provider === 'openai') {
        result = await this.callOpenAI(prompt);
      } else {
        result = await this.callOpenAI(prompt); // Default to OpenAI format
      }

      const parsed = JSON.parse(result);
      const options: AiOption[] = parsed.options || parsed;

      // Validate
      if (!Array.isArray(options) || options.length !== 5) {
        throw new Error('AI returned invalid number of options');
      }

      return options.map((opt, idx) => ({
        index: idx,
        caption: opt.caption.substring(0, 300),
        hashtags: opt.hashtags
          .map((h: string) => h.replace(/^#/, ''))
          .slice(0, 25),
      }));
    } catch (error) {
      this.logger.error('AI generation failed', error);
      // Return fallback options
      return this.generateFallback(input);
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const apiKey = this.configService.get('AI_API_KEY');
    const model = this.configService.get('AI_MODEL', 'gpt-4o');

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [
          { role: 'system', content: 'Kamu adalah content creator TikTok Indonesia profesional. Selalu jawab dalam format JSON yang valid.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    return response.data.choices[0].message.content;
  }

  private buildPrompt(input: {
    briefTopic: string;
    briefPoints: string[];
    targetAudience?: string;
    tone?: string;
    nicheTemplate: NicheType;
    customPrompt?: string;
  }): string {
    const nicheGuardrails = this.getNicheGuardrails(input.nicheTemplate);
    const nicheLabel = this.getNicheLabel(input.nicheTemplate);

    const pointsList = input.briefPoints.map((p) => `  • ${p}`).join('\n');
    const audienceLine = input.targetAudience ? `- Target audiens: ${input.targetAudience}` : '';
    const toneLine = input.tone ? `- Tone: ${input.tone}` : '';
    const customLine = input.customPrompt ? `- Instruksi tambahan: ${input.customPrompt}` : '';

    return `Kamu adalah seorang content creator TikTok Indonesia yang ahli di bidang ${nicheLabel}.

TUGAS: Buatkan 5 opsi caption dan hashtag untuk video TikTok berdasarkan brief berikut.

BRIEF:
- Topik: ${input.briefTopic}
- Poin penting:
${pointsList}
${audienceLine}
${toneLine}
${customLine}ATURAN:
1. Bahasa Indonesia, gaya santai dan engaging untuk TikTok.
2. Setiap caption maksimal 300 karakter (termasuk emoji).
3. Gunakan hook yang kuat di kalimat pertama.
4. Sertakan call-to-action (like, follow, comment, save, share).
${nicheGuardrails}
6. Boleh gunakan emoji secukupnya.
7. Hashtag tanpa karakter # (hanya teks), 10–25 hashtag per opsi.
8. Hashtag harus campuran: niche-specific + trending umum + Indonesia.

FORMAT OUTPUT (JSON):
{
  "options": [
    {
      "index": 0,
      "caption": "...",
      "hashtags": ["tag1", "tag2", ...]
    },
    ... (5 opsi total)
  ]
}

Berikan HANYA JSON, tanpa penjelasan tambahan.`;
  }

  private getNicheGuardrails(niche: NicheType): string {
    switch (niche) {
      case NicheType.BISNIS:
        return '5. JANGAN menggunakan janji seperti "pasti kaya", "jaminan sukses", "penghasilan X juta dijamin", atau klaim berlebihan.';
      case NicheType.KESEHATAN:
        return `5. WAJIB PATUHI GUARDRAILS KESEHATAN:
   - JANGAN membuat klaim medis tanpa dasar.
   - JANGAN memberikan janji penurunan berat badan berlebihan.
   - JANGAN menggantikan nasihat dokter.
   - Tambahkan disclaimer ringan jika topik sensitif medis.
   - Gunakan frasa: "bisa membantu", "menurut beberapa penelitian", "disarankan untuk".`;
      case NicheType.FITNES:
        return `5. WAJIB PATUHI GUARDRAILS FITNESS:
   - JANGAN menjanjikan hasil penurunan berat badan berlebihan.
   - JANGAN menyarankan latihan ekstrem tanpa peringatan.
   - Tambahkan peringatan pemanasan jika gerakan berat.
   - Gunakan frasa: "bisa membantu", "hasil bervariasi", "konsisten adalah kunci".`;
      default:
        return '5. Hindari klaim berlebihan.';
    }
  }

  private getNicheLabel(niche: NicheType): string {
    const labels: Record<string, string> = {
      bisnis: 'bisnis dan kewirausahaan',
      kesehatan: 'kesehatan dan wellness',
      fitnes: 'fitness dan olahraga',
      edukasi: 'edukasi dan pengetahuan',
      hiburan: 'hiburan dan entertainment',
      teknologi: 'teknologi dan gadget',
      kuliner: 'kuliner dan masakan',
      travel: 'travel dan wisata',
      fashion: 'fashion dan style',
      keuangan: 'keuangan dan investasi',
    };
    return labels[niche] || 'umum';
  }

  async suggestBrief(nicheTemplate: string, driveUrl?: string): Promise<{
    brief_topic: string;
    brief_points: string[];
    target_audience: string;
    tone: string;
  }> {
    const nicheLabel = this.getNicheLabel(nicheTemplate as NicheType);
    const urlContext = driveUrl ? `\nURL video: ${driveUrl}` : '';

    const prompt = `Kamu adalah content creator TikTok Indonesia yang ahli di bidang ${nicheLabel}.

TUGAS: Buatkan saran brief/topik untuk video TikTok di niche ${nicheLabel}.${urlContext}

Buatkan:
1. Topik yang menarik dan engaging (1 kalimat pendek)
2. 3-5 poin penting yang harus dibahas di video
3. Target audiens yang tepat
4. Tone yang cocok

FORMAT OUTPUT (JSON):
{
  "brief_topic": "...",
  "brief_points": ["poin 1", "poin 2", "poin 3"],
  "target_audience": "...",
  "tone": "..."
}

Berikan HANYA JSON, tanpa penjelasan tambahan.`;

    try {
      const result = await this.callOpenAI(prompt);
      const parsed = JSON.parse(result);
      return {
        brief_topic: parsed.brief_topic || '',
        brief_points: parsed.brief_points || [],
        target_audience: parsed.target_audience || '',
        tone: parsed.tone || '',
      };
    } catch (error) {
      this.logger.error('AI brief suggestion failed', error);
      // Return fallback
      return this.suggestBriefFallback(nicheTemplate);
    }
  }

  private suggestBriefFallback(nicheTemplate: string): {
    brief_topic: string;
    brief_points: string[];
    target_audience: string;
    tone: string;
  } {
    const suggestions: Record<string, any> = {
      bisnis: {
        brief_topic: 'Tips Memulai Bisnis Online dari Nol',
        brief_points: ['Modal kecil bisa mulai', 'Platform yang tepat', 'Strategi marketing gratis', 'Kesalahan pemula yang harus dihindari'],
        target_audience: 'Anak muda 18-30 tahun yang ingin berbisnis',
        tone: 'Santai, motivatif',
      },
      kesehatan: {
        brief_topic: 'Kebiasaan Sehat yang Sering Diabaikan',
        brief_points: ['Pentingnya tidur cukup', 'Minum air putih yang benar', 'Olahraga ringan sehari-hari', 'Mengelola stress'],
        target_audience: 'Dewasa muda 20-40 tahun yang peduli kesehatan',
        tone: 'Edukatif, ramah',
      },
      fitnes: {
        brief_topic: 'Workout 10 Menit untuk Pemula',
        brief_points: ['Pemanasan penting', 'Gerakan dasar yang efektif', 'Konsistensi lebih penting dari intensitas', 'Cool down yang benar'],
        target_audience: 'Pemula fitness 18-35 tahun',
        tone: 'Energik, suportif',
      },
      edukasi: {
        brief_topic: 'Fakta Menarik yang Jarang Diketahui',
        brief_points: ['Fakta mengejutkan', 'Penjelasan ilmiah sederhana', 'Relevansi dengan kehidupan sehari-hari'],
        target_audience: 'Pelajar dan dewasa muda 15-30 tahun',
        tone: 'Informatif, menghibur',
      },
      hiburan: {
        brief_topic: 'Challenge Seru yang Lagi Viral',
        brief_points: ['Tunjukkan prosesnya', 'Reaksi yang genuine', 'Ajak penonton ikutan'],
        target_audience: 'Gen Z dan millennial 15-30 tahun',
        tone: 'Fun, energik',
      },
      teknologi: {
        brief_topic: 'Fitur HP yang Jarang Dipakai Padahal Berguna',
        brief_points: ['Tunjukkan step by step', 'Manfaat praktis', 'Perbandingan sebelum dan sesudah'],
        target_audience: 'Pengguna smartphone 18-40 tahun',
        tone: 'Informatif, santai',
      },
      kuliner: {
        brief_topic: 'Resep Mudah 5 Menit untuk Anak Kos',
        brief_points: ['Bahan murah dan mudah didapat', 'Step by step jelas', 'Hasil akhir yang menggugah selera'],
        target_audience: 'Anak kos dan dewasa muda 18-30 tahun',
        tone: 'Santai, menghibur',
      },
      travel: {
        brief_topic: 'Hidden Gem Wisata yang Wajib Dikunjungi',
        brief_points: ['Lokasi dan akses', 'Tips hemat budget', 'Waktu terbaik berkunjung', 'Hal yang harus disiapkan'],
        target_audience: 'Traveler muda 20-35 tahun',
        tone: 'Adventurous, informatif',
      },
      fashion: {
        brief_topic: 'Mix and Match Outfit dengan Budget 100K',
        brief_points: ['Inspirasi outfit', 'Tips kombinasi warna', 'Aksesoris yang bikin beda'],
        target_audience: 'Wanita muda 18-30 tahun yang suka fashion',
        tone: 'Trendy, inspiratif',
      },
      keuangan: {
        brief_topic: 'Tips Menabung untuk Gaji UMR',
        brief_points: ['Metode 50/30/20', 'Pengeluaran yang bisa dipangkas', 'Investasi kecil-kecilan', 'Aplikasi pencatat keuangan'],
        target_audience: 'Pekerja muda 22-35 tahun',
        tone: 'Praktis, memotivasi',
      },
    };
    return suggestions[nicheTemplate] || suggestions['bisnis'];
  }

  private generateFallback(input: {
    briefTopic: string;
    briefPoints: string[];
    nicheTemplate: NicheType;
  }): AiOption[] {
    const baseHashtags = ['fyp', 'viral', 'tiktokindonesia', 'edukasi', 'trending',
      'konten', 'belajar', 'tips', 'info', 'indonesia'];

    return Array.from({ length: 5 }, (_, i) => ({
      index: i,
      caption: `${input.briefTopic}\n\n${input.briefPoints.slice(0, 3).join(' • ')}\n\nFollow untuk tips lainnya! 💡`,
      hashtags: [...baseHashtags, input.nicheTemplate, `tips${input.nicheTemplate}`],
    }));
  }
}
