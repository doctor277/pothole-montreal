export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: []
      }
      pothole_status_events: {
        Row: {
          actor_user_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["pothole_status"]
          id: string
          pothole_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["pothole_status"]
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          from_status: Database["public"]["Enums"]["pothole_status"]
          id?: string
          pothole_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["pothole_status"]
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["pothole_status"]
          id?: string
          pothole_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["pothole_status"]
        }
        Relationships: [
          {
            foreignKeyName: "pothole_status_events_pothole_id_fkey"
            columns: ["pothole_id"]
            isOneToOne: false
            referencedRelation: "potholes"
            referencedColumns: ["id"]
          },
        ]
      }
      potholes: {
        Row: {
          canonical_location: unknown
          city: string | null
          country: string | null
          created_at: string
          district: string | null
          formatted_address: string | null
          id: string
          postal_code: string | null
          public_id: string
          region: string | null
          repaired_at: string | null
          report_count: number
          status: Database["public"]["Enums"]["pothole_status"]
          street: string | null
          street_number: string | null
          updated_at: string
        }
        Insert: {
          canonical_location: unknown
          city?: string | null
          country?: string | null
          created_at?: string
          district?: string | null
          formatted_address?: string | null
          id?: string
          postal_code?: string | null
          public_id?: string
          region?: string | null
          repaired_at?: string | null
          report_count?: number
          status?: Database["public"]["Enums"]["pothole_status"]
          street?: string | null
          street_number?: string | null
          updated_at?: string
        }
        Update: {
          canonical_location?: unknown
          city?: string | null
          country?: string | null
          created_at?: string
          district?: string | null
          formatted_address?: string | null
          id?: string
          postal_code?: string | null
          public_id?: string
          region?: string | null
          repaired_at?: string | null
          report_count?: number
          status?: Database["public"]["Enums"]["pothole_status"]
          street?: string | null
          street_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      report_photos: {
        Row: {
          created_at: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          report_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          report_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          report_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_photos_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_upload_intents: {
        Row: {
          cleanup_requested_at: string | null
          created_at: string
          finalized_at: string | null
          finalized_report_id: string | null
          reporter_user_id: string
          storage_path: string
          submission_id: string
        }
        Insert: {
          cleanup_requested_at?: string | null
          created_at?: string
          finalized_at?: string | null
          finalized_report_id?: string | null
          reporter_user_id: string
          storage_path: string
          submission_id: string
        }
        Update: {
          cleanup_requested_at?: string | null
          created_at?: string
          finalized_at?: string | null
          finalized_report_id?: string | null
          reporter_user_id?: string
          storage_path?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_upload_intents_finalized_report_id_fkey"
            columns: ["finalized_report_id"]
            isOneToOne: true
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          accuracy_meters: number | null
          city: string | null
          country: string | null
          created_at: string
          district: string | null
          formatted_address: string | null
          id: string
          installation_id: string | null
          matched_existing_pothole: boolean
          note: string | null
          postal_code: string | null
          pothole_id: string | null
          region: string | null
          reported_location: unknown
          reporter_user_id: string
          severity: Database["public"]["Enums"]["report_severity"]
          street: string | null
          street_number: string | null
          submission_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          district?: string | null
          formatted_address?: string | null
          id?: string
          installation_id?: string | null
          matched_existing_pothole?: boolean
          note?: string | null
          postal_code?: string | null
          pothole_id?: string | null
          region?: string | null
          reported_location: unknown
          reporter_user_id: string
          severity: Database["public"]["Enums"]["report_severity"]
          street?: string | null
          street_number?: string | null
          submission_id: string
        }
        Update: {
          accuracy_meters?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          district?: string | null
          formatted_address?: string | null
          id?: string
          installation_id?: string | null
          matched_existing_pothole?: boolean
          note?: string | null
          postal_code?: string | null
          pothole_id?: string | null
          region?: string | null
          reported_location?: unknown
          reporter_user_id?: string
          severity?: Database["public"]["Enums"]["report_severity"]
          street?: string | null
          street_number?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_pothole_id_fkey"
            columns: ["pothole_id"]
            isOneToOne: false
            referencedRelation: "potholes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_pothole: { Args: { p_public_id: string }; Returns: Json }
      admin_list_potholes: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_public_id?: string
          p_limit?: number
          p_statuses?: Database["public"]["Enums"]["pothole_status"][]
        }
        Returns: {
          created_at: string
          formatted_address: string
          latest_report_created_at: string
          latest_severity: Database["public"]["Enums"]["report_severity"]
          latitude: number
          longitude: number
          public_id: string
          report_count: number
          result_limit_reached: boolean
          status: Database["public"]["Enums"]["pothole_status"]
        }[]
      }
      admin_transition_pothole_status: {
        Args: {
          p_actor_user_id: string
          p_public_id: string
          p_reason?: string
          p_target_status: Database["public"]["Enums"]["pothole_status"]
        }
        Returns: {
          from_status: Database["public"]["Enums"]["pothole_status"]
          outcome: string
          public_id: string
          to_status: Database["public"]["Enums"]["pothole_status"]
          updated_at: string
        }[]
      }
      claim_failed_report_upload_cleanup: {
        Args: { p_reporter_user_id: string; p_submission_id: string }
        Returns: boolean
      }
      finalize_citizen_report: {
        Args: {
          p_accuracy_meters: number
          p_city: string
          p_country: string
          p_district: string
          p_file_size_bytes: number
          p_formatted_address: string
          p_latitude: number
          p_longitude: number
          p_mime_type: string
          p_note: string
          p_postal_code: string
          p_region: string
          p_reporter_user_id: string
          p_severity: Database["public"]["Enums"]["report_severity"]
          p_storage_path: string
          p_street: string
          p_street_number: string
          p_submission_id: string
        }
        Returns: {
          pothole_id: string
          public_id: string
          report_id: string
          status: Database["public"]["Enums"]["pothole_status"]
        }[]
      }
      finalize_citizen_report_v2: {
        Args: {
          p_accuracy_meters: number
          p_city: string
          p_country: string
          p_district: string
          p_existing_pothole_public_id: string
          p_file_size_bytes: number
          p_formatted_address: string
          p_latitude: number
          p_longitude: number
          p_mime_type: string
          p_note: string
          p_postal_code: string
          p_region: string
          p_reporter_user_id: string
          p_severity: Database["public"]["Enums"]["report_severity"]
          p_storage_path: string
          p_street: string
          p_street_number: string
          p_submission_id: string
        }
        Returns: {
          matched_existing: boolean
          outcome: string
          pothole_id: string
          public_id: string
          report_count: number
          report_id: string
          status: Database["public"]["Enums"]["pothole_status"]
        }[]
      }
      find_nearby_public_potholes: {
        Args: {
          p_latitude: number
          p_limit?: number
          p_longitude: number
          p_radius_meters?: number
        }
        Returns: {
          created_at: string
          distance_meters: number
          formatted_address: string
          latest_severity: Database["public"]["Enums"]["report_severity"]
          latitude: number
          longitude: number
          public_id: string
          report_count: number
          status: Database["public"]["Enums"]["pothole_status"]
        }[]
      }
      list_public_potholes_in_bbox: {
        Args: {
          p_limit?: number
          p_max_latitude: number
          p_max_longitude: number
          p_min_latitude: number
          p_min_longitude: number
        }
        Returns: {
          created_at: string
          formatted_address: string
          latest_severity: Database["public"]["Enums"]["report_severity"]
          latitude: number
          longitude: number
          public_id: string
          report_count: number
          result_limit_reached: boolean
          status: Database["public"]["Enums"]["pothole_status"]
        }[]
      }
    }
    Enums: {
      pothole_status:
        | "REPORTED"
        | "UNDER_REVIEW"
        | "VERIFIED"
        | "ASSIGNED"
        | "ACCEPTED"
        | "IN_PROGRESS"
        | "REPAIRED"
        | "REJECTED"
        | "DUPLICATE"
      report_severity: "SMALL" | "MEDIUM" | "DANGEROUS"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      pothole_status: [
        "REPORTED",
        "UNDER_REVIEW",
        "VERIFIED",
        "ASSIGNED",
        "ACCEPTED",
        "IN_PROGRESS",
        "REPAIRED",
        "REJECTED",
        "DUPLICATE",
      ],
      report_severity: ["SMALL", "MEDIUM", "DANGEROUS"],
    },
  },
} as const
